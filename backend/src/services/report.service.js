'use strict';

const mongoose = require('mongoose');
const { writeToBuffer } = require('fast-csv');
const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');
const { ROLES, RECORD_STATUS } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const { parsePagination, buildMeta } = require('../utils/pagination');
const audit = require('./audit.service');
const { hasRole } = require('./recordAccess');
const {
  ReportingPeriod,
  KpiRecord,
  Kpi,
  EsgPillar,
  EsgStandard,
  StandardDisclosure,
  KpiStandardDisclosure,
  AuditLog,
} = require('../models');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const toNum = (d) => (d === null || d === undefined ? null : Number(d.toString()));
const round1 = (n) => Math.round(n * 10) / 10;

async function loadPeriod(actor, id) {
  if (!id) throw ApiError.badRequest('VALIDATION_ERROR', 'reporting_period_id is required', [
    { field: 'reporting_period_id', message: 'Required' },
  ]);
  const p = await ReportingPeriod.findOne({ _id: id, organization_id: actor.organization_id }).lean();
  if (!p) throw ApiError.notFound('Reporting period not found');
  return p;
}

/** GET /reports/pillar-totals */
async function pillarTotals(actor, { reporting_period_id }) {
  const period = await loadPeriod(actor, reporting_period_id);
  const pillars = await EsgPillar.find().sort({ pillar_code: 1 }).lean();
  const rows = await KpiRecord.aggregate([
    { $match: { organization_id: oid(actor.organization_id), reporting_period_id: period._id } },
    { $lookup: { from: 'kpi', localField: 'kpi_id', foreignField: '_id', as: 'kpi' } },
    { $unwind: '$kpi' },
    {
      $group: {
        _id: '$kpi.esg_pillar_id',
        total: { $sum: 1 },
        approved: { $sum: { $cond: [{ $eq: ['$submission_status', RECORD_STATUS.APPROVED] }, 1, 0] } },
        ready: { $sum: { $cond: [{ $eq: ['$submission_status', RECORD_STATUS.READY_FOR_APPROVAL] }, 1, 0] } },
        rejected: { $sum: { $cond: [{ $eq: ['$submission_status', RECORD_STATUS.REJECTED] }, 1, 0] } },
        in_progress: { $sum: { $cond: [{ $eq: ['$submission_status', RECORD_STATUS.IN_PROGRESS] }, 1, 0] } },
      },
    },
  ]);
  const byId = new Map(rows.map((r) => [String(r._id), r]));
  return {
    period: { id: String(period._id), period_name: period.period_name, period_status: period.period_status },
    rows: pillars.map((p) => {
      const r = byId.get(String(p._id)) || { total: 0, approved: 0, ready: 0, rejected: 0, in_progress: 0 };
      return {
        pillar_id: String(p._id),
        pillar_code: p.pillar_code,
        pillar_name: p.pillar_name,
        total: r.total,
        approved: r.approved,
        ready_for_approval: r.ready,
        rejected: r.rejected,
        in_progress: r.in_progress,
        completion_pct: r.total ? round1((r.approved / r.total) * 100) : 0,
      };
    }),
  };
}

/** GET /reports/content-index — backend.md §8.8, workflow.md §8.2 (BR-1, BR-11). */
async function contentIndex(actor, { reporting_period_id, esg_standard_id }) {
  const period = await loadPeriod(actor, reporting_period_id);
  const standard = esg_standard_id
    ? await EsgStandard.findById(esg_standard_id).lean()
    : await EsgStandard.findOne({ standard_code: 'GRI' }).lean();
  if (!standard) throw ApiError.notFound('Standard not found');

  const disclosures = await StandardDisclosure.find({ esg_standard_id: standard._id })
    .sort({ disclosure_code: 1 })
    .lean();
  const orgKpis = await Kpi.find({ organization_id: actor.organization_id }).lean();
  const kpiById = new Map(orgKpis.map((k) => [String(k._id), k]));
  const mappings = await KpiStandardDisclosure.find({
    standard_disclosure_id: { $in: disclosures.map((d) => d._id) },
    kpi_id: { $in: orgKpis.map((k) => k._id) },
  }).lean();

  const records = await KpiRecord.aggregate([
    { $match: { organization_id: oid(actor.organization_id), reporting_period_id: period._id } },
    { $lookup: { from: 'app_user', localField: 'data_owner_user_id', foreignField: '_id', as: 'owner' } },
    { $lookup: { from: 'app_user', localField: 'approver_user_id', foreignField: '_id', as: 'approver' } },
    {
      $lookup: {
        from: 'evidence',
        let: { rid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$kpi_record_id', '$$rid'] }, { $eq: ['$is_active', true] }] } } },
          { $count: 'n' },
        ],
        as: 'ev',
      },
    },
  ]);
  const recByKpi = new Map(records.map((r) => [String(r.kpi_id), r]));

  const rows = disclosures.map((d) => {
    const kpis = mappings
      .filter((m) => String(m.standard_disclosure_id) === String(d._id))
      .map((m) => kpiById.get(String(m.kpi_id)))
      .filter(Boolean)
      .map((k) => {
        const r = recByKpi.get(String(k._id));
        const approved = r && r.submission_status === RECORD_STATUS.APPROVED;
        return {
          kpi_id: String(k._id),
          kpi_code: k.kpi_code,
          kpi_name: k.kpi_name,
          unit_of_measurement: k.unit_of_measurement,
          record_id: r ? String(r._id) : null,
          record_status: r ? r.submission_status : null,
          // BR-1: only approved values are reported
          actual_value: approved ? toNum(r.actual_value) : null,
          target_value: approved ? toNum(r.target_value) : null,
          baseline_value: approved ? toNum(r.baseline_value) : null,
          data_owner: approved ? r.owner[0]?.display_name || null : null,
          approver: approved ? r.approver[0]?.display_name || null : null,
          evidence_count: approved ? r.ev[0]?.n || 0 : 0,
        };
      });
    const hasApproved = kpis.some((k) => k.record_status === RECORD_STATUS.APPROVED);
    return {
      disclosure_id: String(d._id),
      disclosure_code: d.disclosure_code,
      disclosure_title: d.disclosure_title,
      is_mandatory: d.is_mandatory,
      kpis,
      status: hasApproved ? 'Approved' : 'Gap',
      gap: !hasApproved,
      gap_severity: !hasApproved ? (d.is_mandatory ? 'mandatory' : 'optional') : null,
    };
  });

  return {
    period: { id: String(period._id), period_name: period.period_name, period_status: period.period_status },
    standard: {
      id: String(standard._id),
      standard_code: standard.standard_code,
      standard_name: standard.standard_name,
      version_label: standard.version_label,
    },
    summary: {
      disclosures: rows.length,
      covered: rows.filter((r) => !r.gap).length,
      gaps: rows.filter((r) => r.gap).length,
      mandatory_gaps: rows.filter((r) => r.gap_severity === 'mandatory').length,
    },
    rows,
  };
}

/** GET /reports/kpi-trend — approved values across periods. */
async function kpiTrend(actor, { kpi_id }) {
  if (!kpi_id) throw ApiError.badRequest('VALIDATION_ERROR', 'kpi_id is required');
  const kpi = await Kpi.findOne({ _id: kpi_id, organization_id: actor.organization_id }).lean();
  if (!kpi) throw ApiError.notFound('KPI not found');
  const rows = await KpiRecord.find({ kpi_id: kpi._id, submission_status: RECORD_STATUS.APPROVED })
    .populate('reporting_period_id', 'period_name period_start_date')
    .lean();
  return {
    kpi: { id: String(kpi._id), kpi_code: kpi.kpi_code, kpi_name: kpi.kpi_name, unit_of_measurement: kpi.unit_of_measurement },
    points: rows
      .filter((r) => r.reporting_period_id)
      .sort((a, b) => new Date(a.reporting_period_id.period_start_date) - new Date(b.reporting_period_id.period_start_date))
      .map((r) => ({
        period_id: String(r.reporting_period_id._id),
        period_name: r.reporting_period_id.period_name,
        actual_value: toNum(r.actual_value),
        target_value: toNum(r.target_value),
        baseline_value: toNum(r.baseline_value),
      })),
  };
}

async function exportRows(actor, period, includeAll) {
  const match = { organization_id: oid(actor.organization_id), reporting_period_id: period._id };
  if (!includeAll) match.submission_status = RECORD_STATUS.APPROVED;
  const rows = await KpiRecord.aggregate([
    { $match: match },
    { $lookup: { from: 'kpi', localField: 'kpi_id', foreignField: '_id', as: 'kpi' } },
    { $unwind: '$kpi' },
    { $lookup: { from: 'esg_pillar', localField: 'kpi.esg_pillar_id', foreignField: '_id', as: 'pillar' } },
    { $lookup: { from: 'app_user', localField: 'data_owner_user_id', foreignField: '_id', as: 'owner' } },
    { $lookup: { from: 'app_user', localField: 'approver_user_id', foreignField: '_id', as: 'approver' } },
    {
      $lookup: {
        from: 'kpi_standard_disclosure',
        localField: 'kpi_id',
        foreignField: 'kpi_id',
        as: 'maps',
      },
    },
    { $lookup: { from: 'standard_disclosure', localField: 'maps.standard_disclosure_id', foreignField: '_id', as: 'discs' } },
    {
      $lookup: {
        from: 'evidence',
        let: { rid: '$_id' },
        pipeline: [
          { $match: { $expr: { $and: [{ $eq: ['$kpi_record_id', '$$rid'] }, { $eq: ['$is_active', true] }] } } },
          { $count: 'n' },
        ],
        as: 'ev',
      },
    },
    { $sort: { 'kpi.kpi_code': 1 } },
  ]);
  return rows.map((r) => {
    const out = {
      Period: period.period_name,
      'KPI Code': r.kpi.kpi_code,
      'KPI Name': r.kpi.kpi_name,
      Pillar: r.pillar[0]?.pillar_code || '',
      Disclosures: r.discs.map((d) => d.disclosure_code).join('; '),
      Unit: r.kpi.unit_of_measurement,
      'Actual Value': toNum(r.actual_value),
      'Target Value': toNum(r.target_value),
      'Baseline Value': toNum(r.baseline_value),
      'Data Owner': r.owner[0]?.display_name || '',
      Approver: r.approver[0]?.display_name || '',
      'Evidence Files': r.ev[0]?.n || 0,
      'Submitted At': r.submitted_at ? new Date(r.submitted_at).toISOString() : '',
    };
    if (includeAll) out.Status = r.submission_status;
    return out;
  });
}

async function buildPdf(period, rows, includeAll) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 36 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fillColor('#DC1F26').fontSize(18).text('ESG Data Summary', { continued: false });
    doc.fillColor('#1F1F1F').fontSize(11).text(`Period: ${period.period_name} (${period.period_status})`);
    doc.text(`Generated: ${new Date().toISOString().slice(0, 10)} — ${includeAll ? 'all records' : 'approved records only'}`);
    doc.moveDown();

    const cols = [['KPI Code', 70], ['KPI Name', 220], ['Pillar', 45], ['Value', 90], ['Unit', 55], ['Disclosures', 150], ['Approver', 110]];
    const drawRow = (vals, bold) => {
      const y = doc.y;
      let x = doc.page.margins.left;
      doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(9);
      vals.forEach((v, i) => {
        doc.text(String(v ?? ''), x, y, { width: cols[i][1] - 6, ellipsis: true, lineBreak: false });
        x += cols[i][1];
      });
      doc.moveDown(0.9);
      if (doc.y > doc.page.height - 50) doc.addPage();
    };
    drawRow(cols.map((c) => c[0]), true);
    for (const r of rows) {
      drawRow([r['KPI Code'], r['KPI Name'], r.Pillar, r['Actual Value'], r.Unit, r.Disclosures, r.Approver]);
    }
    if (!rows.length) doc.font('Helvetica').text('No records to report.');
    doc.end();
  });
}

/** GET /reports/export — approved only unless include_all (Admin); audit EXPORT. */
async function exportReport(actor, { reporting_period_id, format = 'csv', include_all }) {
  const period = await loadPeriod(actor, reporting_period_id);
  const includeAll = (include_all === 'true' || include_all === true) && hasRole(actor, ROLES.ADMIN);
  if (!['csv', 'xlsx', 'pdf'].includes(format)) {
    throw ApiError.badRequest('VALIDATION_ERROR', 'format must be csv, xlsx or pdf');
  }
  const rows = await exportRows(actor, period, includeAll);
  const safeName = period.period_name.replace(/[^\w-]+/g, '_');
  let buffer;
  let contentType;

  if (format === 'csv') {
    const headers = rows.length ? Object.keys(rows[0]) : ['Period', 'KPI Code', 'KPI Name'];
    buffer = await writeToBuffer(rows, { headers, writeBOM: true });
    contentType = 'text/csv; charset=utf-8';
  } else if (format === 'xlsx') {
    const wb = new ExcelJS.Workbook();
    wb.creator = 'ESG Management System';
    const ws = wb.addWorksheet('ESG Data');
    const headers = rows.length ? Object.keys(rows[0]) : ['Period', 'KPI Code', 'KPI Name'];
    ws.columns = headers.map((h) => ({ header: h, key: h, width: Math.max(12, h.length + 4) }));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC1F26' } };
    rows.forEach((r) => ws.addRow(r));
    ws.views = [{ state: 'frozen', ySplit: 1 }];
    buffer = Buffer.from(await wb.xlsx.writeBuffer());
    contentType = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  } else {
    buffer = await buildPdf(period, rows, includeAll);
    contentType = 'application/pdf';
  }

  await audit.log({
    user_id: actor.id,
    organization_id: actor.organization_id,
    entity_name: 'reporting_period',
    record_id: period._id,
    action_name: 'EXPORT',
    updated_value: { format, include_all: includeAll, rows: rows.length },
  });

  return {
    buffer,
    contentType,
    filename: `esg-${safeName}${includeAll ? '-all' : '-approved'}.${format}`,
    rowCount: rows.length,
  };
}

/** GET /audit-logs — Admin/Viewer, newest first. */
async function listAuditLogs(actor, query = {}) {
  const { page, limit, skip } = parsePagination(query, { defaultSort: '-created_at', allowedSort: ['created_at'] });
  const filter = { organization_id: actor.organization_id };
  if (query.user_id) filter.user_id = query.user_id;
  if (query.entity_name) filter.entity_name = query.entity_name;
  if (query.action_name) filter.action_name = query.action_name;
  if (query.record_id) filter.record_id = query.record_id;
  if (query.from || query.to) {
    filter.created_at = {};
    if (query.from) filter.created_at.$gte = new Date(query.from);
    if (query.to) {
      const to = new Date(query.to);
      if (/^\d{4}-\d{2}-\d{2}$/.test(query.to)) to.setUTCHours(23, 59, 59, 999);
      filter.created_at.$lte = to;
    }
  }
  const [rows, total] = await Promise.all([
    AuditLog.find(filter).sort({ created_at: -1, _id: -1 }).skip(skip).limit(limit).populate('user_id', 'display_name email').lean(),
    AuditLog.countDocuments(filter),
  ]);
  return {
    data: rows.map((r) => ({
      id: String(r._id),
      created_at: r.created_at,
      action_name: r.action_name,
      entity_name: r.entity_name,
      record_id: String(r.record_id),
      previous_value: r.previous_value,
      updated_value: r.updated_value,
      user: r.user_id ? { id: String(r.user_id._id), display_name: r.user_id.display_name, email: r.user_id.email } : null,
    })),
    meta: buildMeta({ page, limit }, total),
  };
}

module.exports = { pillarTotals, contentIndex, kpiTrend, exportReport, listAuditLogs };

