'use strict';

const mongoose = require('mongoose');
const env = require('../config/env');
const { ROLES, RECORD_STATUS, PERIOD_STATUS, APPROVAL_STATUS } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const withTransaction = require('../utils/withTransaction');
const { parsePagination, buildMeta, searchRegex } = require('../utils/pagination');
const audit = require('./audit.service');
const notification = require('./notification.service');
const { recordScopeFilter, hasRole } = require('./recordAccess');
const { validateAssignees } = require('./period.service');
const {
  KpiRecord,
  Kpi,
  ReportingPeriod,
  AppUser,
  Department,
  EsgPillar,
  Evidence,
  Approval,
  AuditLog,
  KpiStandardDisclosure,
} = require('../models');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const toNum = (d) => (d === null || d === undefined ? null : Number(d.toString()));
const toDec = (n) => (n === null || n === undefined ? null : mongoose.Types.Decimal128.fromString(String(n)));
const EDITABLE = [RECORD_STATUS.IN_PROGRESS, RECORD_STATUS.REJECTED];

/** Allowed transitions (workflow.md §6.2, backend.md §8.3). */
const ALLOWED = {
  submit: { from: [RECORD_STATUS.IN_PROGRESS, RECORD_STATUS.REJECTED], to: RECORD_STATUS.READY_FOR_APPROVAL },
  approve: { from: [RECORD_STATUS.READY_FOR_APPROVAL], to: RECORD_STATUS.APPROVED },
  reject: { from: [RECORD_STATUS.READY_FOR_APPROVAL], to: RECORD_STATUS.REJECTED },
  reopen: { from: [RECORD_STATUS.APPROVED], to: RECORD_STATUS.IN_PROGRESS },
};

function allowedActionsFor(status) {
  return Object.entries(ALLOWED)
    .filter(([, r]) => r.from.includes(status))
    .map(([a]) => a);
}

/** Org-scoped load used by mutations (role checks follow, giving 403 not 404). */
async function loadOrgRecord(actor, id, session = null) {
  const rec = await KpiRecord.findOne({ _id: id, organization_id: actor.organization_id }).session(session);
  if (!rec) throw ApiError.notFound('KPI record not found');
  return rec;
}

/** Role-scoped load used by reads (records the caller may not see → 404). */
async function loadVisibleRecord(actor, id) {
  const rec = await KpiRecord.findOne({
    _id: id,
    organization_id: actor.organization_id,
    ...recordScopeFilter(actor),
  });
  if (!rec) throw ApiError.notFound('KPI record not found');
  return rec;
}

async function loadOpenPeriod(rec, session) {
  const period = await ReportingPeriod.findById(rec.reporting_period_id).session(session);
  if (!period || period.period_status === PERIOD_STATUS.CLOSED) {
    throw ApiError.conflict('PERIOD_CLOSED', 'This reporting period is closed');
  }
  return period;
}

function assertIsOwner(actor, rec) {
  if (String(actor.id) !== String(rec.data_owner_user_id)) {
    throw ApiError.forbidden('FORBIDDEN', 'Only the assigned Data Owner can do this');
  }
}

function assertEditable(rec) {
  if (!EDITABLE.includes(rec.submission_status)) {
    throw ApiError.conflict('RECORD_LOCKED', `Record is ${rec.submission_status} and cannot be edited`, {
      current: rec.submission_status,
    });
  }
}

// ---------------------------------------------------------------------------
// Reads
// ---------------------------------------------------------------------------

async function listRecords(actor, query) {
  const { page, limit, skip } = parsePagination(query);
  const match = {
    organization_id: oid(actor.organization_id),
    reporting_period_id: oid(query.reporting_period_id),
    ...recordScopeFilter(actor),
  };
  if (query.submission_status) match.submission_status = { $in: String(query.submission_status).split(',') };
  if (query.data_owner_user_id) match.data_owner_user_id = oid(query.data_owner_user_id);
  if (query.approver_user_id) match.approver_user_id = oid(query.approver_user_id);
  if (query.scope === 'mine') match.data_owner_user_id = oid(actor.id);
  if (query.scope === 'my_approvals') match.approver_user_id = oid(actor.id);

  const kpiMatch = {};
  if (query.esg_pillar_id) kpiMatch['kpi.esg_pillar_id'] = oid(query.esg_pillar_id);
  const rx = searchRegex(query.q);
  if (rx) kpiMatch.$or = [{ 'kpi.kpi_code': rx }, { 'kpi.kpi_name': rx }];
  if (query.department_id) kpiMatch['owner.department_id'] = oid(query.department_id);

  const sortMap = {
    kpi_code: { 'kpi.kpi_code': 1 },
    '-kpi_code': { 'kpi.kpi_code': -1 },
    submitted_at: { submitted_at: 1 },
    '-submitted_at': { submitted_at: -1 },
    created_at: { created_at: 1 },
    '-created_at': { created_at: -1 },
  };
  const sort = sortMap[query.sort] || { 'kpi.kpi_code': 1 };

  const pipeline = [
    { $match: match },
    { $lookup: { from: 'kpi', localField: 'kpi_id', foreignField: '_id', as: 'kpi' } },
    { $unwind: '$kpi' },
    { $lookup: { from: 'app_user', localField: 'data_owner_user_id', foreignField: '_id', as: 'owner' } },
    { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'app_user', localField: 'approver_user_id', foreignField: '_id', as: 'approver' } },
    { $unwind: { path: '$approver', preserveNullAndEmptyArrays: true } },
    { $match: kpiMatch },
    {
      $facet: {
        rows: [
          { $sort: sort },
          { $skip: skip },
          { $limit: limit },
          { $lookup: { from: 'esg_pillar', localField: 'kpi.esg_pillar_id', foreignField: '_id', as: 'pillar' } },
          { $unwind: { path: '$pillar', preserveNullAndEmptyArrays: true } },
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
        ],
        total: [{ $count: 'n' }],
      },
    },
  ];

  const [res] = await KpiRecord.aggregate(pipeline);
  const total = res.total[0]?.n || 0;
  const data = res.rows.map((r) => ({
    _id: r._id,
    id: String(r._id),
    reporting_period_id: r.reporting_period_id,
    submission_status: r.submission_status,
    actual_value: toNum(r.actual_value),
    target_value: toNum(r.target_value),
    baseline_value: toNum(r.baseline_value),
    submitted_at: r.submitted_at,
    created_at: r.created_at,
    updated_at: r.updated_at,
    evidence_count: r.ev[0]?.n || 0,
    kpi: {
      id: String(r.kpi._id),
      kpi_code: r.kpi.kpi_code,
      kpi_name: r.kpi.kpi_name,
      unit_of_measurement: r.kpi.unit_of_measurement,
    },
    pillar: r.pillar ? { id: String(r.pillar._id), pillar_code: r.pillar.pillar_code, pillar_name: r.pillar.pillar_name } : null,
    data_owner: r.owner
      ? { id: String(r.owner._id), display_name: r.owner.display_name, is_active: r.owner.is_active }
      : null,
    approver: r.approver
      ? { id: String(r.approver._id), display_name: r.approver.display_name, is_active: r.approver.is_active }
      : null,
  }));
  return { data, meta: buildMeta({ page, limit }, total) };
}

async function previousPeriodValue(rec, period) {
  const prevPeriod = await ReportingPeriod.findOne({
    organization_id: period.organization_id,
    period_start_date: { $lt: period.period_start_date },
  })
    .sort({ period_start_date: -1 })
    .lean();
  if (!prevPeriod) return null;
  const prevRec = await KpiRecord.findOne({ kpi_id: rec.kpi_id, reporting_period_id: prevPeriod._id }).lean();
  if (!prevRec || prevRec.actual_value == null) return null;
  return {
    period_id: String(prevPeriod._id),
    period_name: prevPeriod.period_name,
    actual_value: toNum(prevRec.actual_value),
    submission_status: prevRec.submission_status,
  };
}

function userSummary(u) {
  return u ? { id: String(u._id), display_name: u.display_name, email: u.email, is_active: u.is_active } : null;
}

async function getRecord(actor, id) {
  const rec = await loadVisibleRecord(actor, id);
  const [kpi, period, owner, approver, evidence, approvals, mappings] = await Promise.all([
    Kpi.findById(rec.kpi_id).lean(),
    ReportingPeriod.findById(rec.reporting_period_id).lean(),
    AppUser.findById(rec.data_owner_user_id).lean(),
    AppUser.findById(rec.approver_user_id).lean(),
    Evidence.find({ kpi_record_id: rec._id, is_active: true })
      .sort({ uploaded_at: -1 })
      .populate('uploaded_by_user_id', 'display_name')
      .lean(),
    Approval.find({ kpi_record_id: rec._id })
      .sort({ reviewed_at: -1 })
      .populate('approver_user_id', 'display_name')
      .lean(),
    KpiStandardDisclosure.find({ kpi_id: rec.kpi_id })
      .populate({ path: 'standard_disclosure_id', populate: { path: 'esg_standard_id', select: 'standard_code' } })
      .lean(),
  ]);
  const [pillar, ownerDept] = await Promise.all([
    EsgPillar.findById(kpi.esg_pillar_id).lean(),
    owner?.department_id ? Department.findById(owner.department_id).lean() : null,
  ]);

  const prev = await previousPeriodValue(rec, period);
  const actual = rec.actual_value;
  const changePct =
    prev && prev.actual_value && actual != null
      ? Math.round(((actual - prev.actual_value) / prev.actual_value) * 10000) / 100
      : null;

  const isOwner = String(actor.id) === String(rec.data_owner_user_id);
  const isApprover = String(actor.id) === String(rec.approver_user_id);
  const periodOpen = period.period_status === PERIOD_STATUS.IN_PROGRESS;

  return {
    ...rec.toJSON(),
    id: String(rec._id),
    kpi: {
      id: String(kpi._id),
      kpi_code: kpi.kpi_code,
      kpi_name: kpi.kpi_name,
      unit_of_measurement: kpi.unit_of_measurement,
      calculation_method: kpi.calculation_method,
      frequency: kpi.frequency,
    },
    pillar: pillar ? { id: String(pillar._id), pillar_code: pillar.pillar_code, pillar_name: pillar.pillar_name } : null,
    disclosures: mappings
      .filter((m) => m.standard_disclosure_id)
      .map((m) => ({
        id: String(m.standard_disclosure_id._id),
        disclosure_code: m.standard_disclosure_id.disclosure_code,
        disclosure_title: m.standard_disclosure_id.disclosure_title,
        standard_code: m.standard_disclosure_id.esg_standard_id?.standard_code,
      })),
    period: {
      id: String(period._id),
      period_name: period.period_name,
      period_start_date: period.period_start_date,
      period_end_date: period.period_end_date,
      period_status: period.period_status,
    },
    data_owner: { ...userSummary(owner), department: ownerDept ? ownerDept.department_name : null },
    approver: userSummary(approver),
    previous_period: prev,
    change_pct_vs_previous: changePct,
    evidence: evidence.map((e) => ({
      id: String(e._id),
      file_name: e.file_name,
      mime_type: e.mime_type,
      file_size_bytes: e.file_size_bytes,
      file_hash: e.file_hash,
      uploaded_at: e.uploaded_at,
      uploaded_by: e.uploaded_by_user_id ? { id: String(e.uploaded_by_user_id._id), display_name: e.uploaded_by_user_id.display_name } : null,
    })),
    approvals: approvals.map(mapApproval),
    permissions: {
      can_edit: isOwner && periodOpen && EDITABLE.includes(rec.submission_status),
      can_submit: isOwner && periodOpen && EDITABLE.includes(rec.submission_status),
      can_review: isApprover && !isOwner && periodOpen && rec.submission_status === RECORD_STATUS.READY_FOR_APPROVAL,
      can_reopen: hasRole(actor, ROLES.ADMIN) && periodOpen && rec.submission_status === RECORD_STATUS.APPROVED,
      can_reassign: hasRole(actor, ROLES.ADMIN) && periodOpen && rec.submission_status !== RECORD_STATUS.APPROVED,
    },
    allowed_actions: periodOpen ? allowedActionsFor(rec.submission_status) : [],
  };
}

function mapApproval(a) {
  return {
    id: String(a._id),
    approval_status: a.approval_status,
    comments: a.comments,
    reviewed_at: a.reviewed_at,
    approver: a.approver_user_id ? { id: String(a.approver_user_id._id), display_name: a.approver_user_id.display_name } : null,
  };
}

async function listApprovals(actor, id) {
  const rec = await loadVisibleRecord(actor, id);
  const rows = await Approval.find({ kpi_record_id: rec._id })
    .sort({ reviewed_at: -1 })
    .populate('approver_user_id', 'display_name')
    .lean();
  return rows.map(mapApproval);
}

async function listHistory(actor, id) {
  const rec = await loadVisibleRecord(actor, id);
  const evidenceIds = await Evidence.find({ kpi_record_id: rec._id }).distinct('_id');
  const rows = await AuditLog.find({
    organization_id: actor.organization_id,
    $or: [
      { entity_name: 'kpi_record', record_id: rec._id },
      { entity_name: 'evidence', record_id: { $in: evidenceIds } },
    ],
  })
    .sort({ created_at: -1 })
    .populate('user_id', 'display_name')
    .lean();
  return rows.map((r) => ({
    id: String(r._id),
    action_name: r.action_name,
    entity_name: r.entity_name,
    record_id: String(r.record_id),
    previous_value: r.previous_value,
    updated_value: r.updated_value,
    created_at: r.created_at,
    user: r.user_id ? { id: String(r.user_id._id), display_name: r.user_id.display_name } : null,
  }));
}

// ---------------------------------------------------------------------------
// Mutations
// ---------------------------------------------------------------------------

/** PATCH /records/:id — backend.md §8.4. */
async function updateValues(actor, id, body) {
  return withTransaction(async (session) => {
    const rec = await loadOrgRecord(actor, id, session);
    await loadOpenPeriod(rec, session);
    assertIsOwner(actor, rec);
    assertEditable(rec);

    if (new Date(body.updated_at).getTime() !== rec.updated_at.getTime()) {
      throw ApiError.conflict('STALE_RECORD', 'Someone changed this record. Reload to see the latest version.');
    }

    const kpi = await Kpi.findById(rec.kpi_id).session(session).lean();
    const isPercent = kpi.unit_of_measurement.trim() === '%';
    const prev = {};
    const next = {};
    const details = [];

    for (const field of ['actual_value', 'target_value', 'baseline_value']) {
      if (body[field] === undefined) continue;
      const value = body[field];
      if (isPercent && value !== null && value > 100) {
        details.push({ field, message: 'Percentage values must be between 0 and 100' });
        continue;
      }
      const current = rec[field];
      if (current === value) continue;
      prev[field] = current;
      next[field] = value;
      rec[field] = toDec(value);
    }
    if (details.length) throw ApiError.badRequest('VALIDATION_ERROR', 'Some fields are invalid', details);

    if (Object.keys(next).length) {
      await rec.save({ session });
      await audit.log({
        session,
        user_id: actor.id,
        organization_id: actor.organization_id,
        entity_name: 'kpi_record',
        record_id: rec._id,
        action_name: 'UPDATE',
        previous_value: prev,
        updated_value: next,
      });
    }
    return rec.toJSON();
  });
}

/** PATCH /records/:id/assignment — Admin, status ≠ Approved (workflow.md §5). */
async function reassign(actor, id, body) {
  const result = await withTransaction(async (session) => {
    const rec = await loadOrgRecord(actor, id, session);
    await loadOpenPeriod(rec, session);
    if (rec.submission_status === RECORD_STATUS.APPROVED) {
      throw ApiError.conflict('RECORD_LOCKED', 'Approved records cannot be reassigned. Reopen first.');
    }
    const ownerId = body.data_owner_user_id || rec.data_owner_user_id;
    const approverId = body.approver_user_id || rec.approver_user_id;
    await validateAssignees(actor, { ownerId, approverId }, session);

    const prev = { data_owner_user_id: rec.data_owner_user_id, approver_user_id: rec.approver_user_id };
    rec.data_owner_user_id = ownerId;
    rec.approver_user_id = approverId;
    await rec.save({ session });

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'kpi_record',
      record_id: rec._id,
      action_name: 'REASSIGN',
      previous_value: prev,
      updated_value: { data_owner_user_id: ownerId, approver_user_id: approverId },
    });
    return { rec, prev };
  });

  const { rec, prev } = result;
  const changed = [];
  if (String(prev.data_owner_user_id) !== String(rec.data_owner_user_id)) changed.push([rec.data_owner_user_id, 'Data Owner']);
  if (String(prev.approver_user_id) !== String(rec.approver_user_id)) changed.push([rec.approver_user_id, 'Approver']);
  if (changed.length) {
    const [kpi, period] = await Promise.all([
      Kpi.findById(rec.kpi_id).lean(),
      ReportingPeriod.findById(rec.reporting_period_id).lean(),
    ]);
    for (const [uid, roleLabel] of changed) {
      const u = await AppUser.findById(uid).lean();
      if (u) {
        await notification.sendAssignmentEmail({
          email: u.email,
          display_name: u.display_name,
          roleLabel,
          period_name: period.period_name,
          period_end_date: period.period_end_date,
          kpis: [kpi],
        });
      }
    }
  }
  return rec.toJSON();
}

/** Record state machine — backend.md §8.3. */
async function transition(actor, id, action, payload = {}) {
  const rule = ALLOWED[action];
  const rec = await withTransaction(async (session) => {
    const record = await loadOrgRecord(actor, id, session);
    await loadOpenPeriod(record, session);

    if (!rule.from.includes(record.submission_status)) {
      throw ApiError.conflict('INVALID_TRANSITION', `Cannot ${action} a record that is ${record.submission_status}`, {
        current: record.submission_status,
        allowed_actions: allowedActionsFor(record.submission_status),
      });
    }

    switch (action) {
      case 'submit': {
        assertIsOwner(actor, record);
        if (record.actual_value == null) {
          throw ApiError.unprocessable('VALUE_REQUIRED', 'Enter the actual value before submitting');
        }
        const evCount = await Evidence.countDocuments({ kpi_record_id: record._id, is_active: true }).session(session);
        if (evCount < 1) {
          throw ApiError.unprocessable('EVIDENCE_REQUIRED', 'Upload at least one evidence file before submitting');
        }
        const approver = await AppUser.findOne({ _id: record.approver_user_id, is_active: true }).session(session).lean();
        if (!approver || String(approver._id) === String(record.data_owner_user_id)) {
          throw ApiError.unprocessable('VALIDATION_ERROR', 'This record has no valid active approver. Ask an Admin to reassign it.');
        }
        record.submitted_at = new Date();
        break;
      }
      case 'approve':
      case 'reject': {
        // BR-4: nobody approves a record they own (checked first, explicit code)
        if (String(actor.id) === String(record.data_owner_user_id)) {
          throw ApiError.forbidden('SEGREGATION_OF_DUTIES', 'You cannot review a record you own');
        }
        if (String(actor.id) !== String(record.approver_user_id)) {
          throw ApiError.forbidden('FORBIDDEN', 'Only the assigned Approver can review this record');
        }
        const comments = String(payload.comments || '').trim();
        if (action === 'reject' && comments.length < 5) {
          throw ApiError.unprocessable('REMARK_REQUIRED', 'A remark of at least 5 characters is required to reject');
        }
        await Approval.create(
          [
            {
              kpi_record_id: record._id,
              approver_user_id: actor._id,
              approval_status: action === 'approve' ? APPROVAL_STATUS.APPROVED : APPROVAL_STATUS.REJECTED,
              comments,
              reviewed_at: new Date(),
            },
          ],
          { session },
        );
        break;
      }
      case 'reopen': {
        if (!hasRole(actor, ROLES.ADMIN)) {
          throw ApiError.forbidden('FORBIDDEN', 'Only an Admin can reopen an approved record');
        }
        if (String(payload.reason || '').trim().length < 5) {
          throw ApiError.unprocessable('REASON_REQUIRED', 'A reason of at least 5 characters is required');
        }
        record.submitted_at = null;
        break;
      }
      default:
        throw ApiError.badRequest('VALIDATION_ERROR', 'Unknown action');
    }

    const previous = record.submission_status;
    record.submission_status = rule.to;
    await record.save({ session });

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'kpi_record',
      record_id: record._id,
      action_name: action.toUpperCase(),
      previous_value: { submission_status: previous },
      updated_value: {
        submission_status: rule.to,
        comments: payload.comments || undefined,
        reason: payload.reason || undefined,
      },
    });
    return record;
  });

  await notifyAfterTransition(action, rec, actor, payload);
  return rec.toJSON();
}

async function notifyAfterTransition(action, rec, actor, payload) {
  const [kpi, owner, approver] = await Promise.all([
    Kpi.findById(rec.kpi_id).lean(),
    AppUser.findById(rec.data_owner_user_id).lean(),
    AppUser.findById(rec.approver_user_id).lean(),
  ]);
  const link = `${env.CLIENT_URL}/records/${rec._id}`;
  const label = `${kpi.kpi_code} ${kpi.kpi_name}`;
  const send = (u, subject, body) => u && notification.sendTransitionEmail({ to: u.email, subject, body });

  if (action === 'submit') {
    await send(approver, `[ESG] Ready for approval: ${label}`,
      `Hello ${approver?.display_name},\n\n${owner?.display_name} submitted ${label} for your approval.\n\nReview: ${link}`);
  } else if (action === 'approve') {
    await send(owner, `[ESG] Approved: ${label}`,
      `Hello ${owner?.display_name},\n\n${actor.display_name} approved ${label}.\n\nView: ${link}`);
  } else if (action === 'reject') {
    await send(owner, `[ESG] Rejected: ${label}`,
      `Hello ${owner?.display_name},\n\n${actor.display_name} rejected ${label} with this remark:\n\n"${payload.comments}"\n\nFix and resubmit: ${link}`);
  } else if (action === 'reopen') {
    for (const u of [owner, approver]) {
      await send(u, `[ESG] Reopened: ${label}`,
        `Hello ${u?.display_name},\n\n${actor.display_name} reopened ${label}.\nReason: ${payload.reason}\n\nView: ${link}`);
    }
  }
}

module.exports = {
  ALLOWED,
  listRecords,
  getRecord,
  listApprovals,
  listHistory,
  updateValues,
  reassign,
  transition,
  loadOrgRecord,
  loadVisibleRecord,
  loadOpenPeriod,
  assertIsOwner,
  assertEditable,
};

