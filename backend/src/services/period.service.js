'use strict';

const mongoose = require('mongoose');
const { ROLES, RECORD_STATUS, PERIOD_STATUS } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const withTransaction = require('../utils/withTransaction');
const { parsePagination, buildMeta, searchRegex } = require('../utils/pagination');
const audit = require('./audit.service');
const notification = require('./notification.service');
const { getActiveRoleNames } = require('./auth.service');
const { recordScopeFilter } = require('./recordAccess');
const { ReportingPeriod, KpiRecord, Kpi, AppUser } = require('../models');

const oid = (v) => new mongoose.Types.ObjectId(String(v));

async function loadPeriod(actor, id, session = null) {
  const period = await ReportingPeriod.findOne({
    _id: id,
    organization_id: actor.organization_id,
  }).session(session);
  if (!period) throw ApiError.notFound('Reporting period not found');
  return period;
}

function assertOpen(period) {
  if (period.period_status === PERIOD_STATUS.CLOSED) {
    throw ApiError.conflict('PERIOD_CLOSED', 'This reporting period is closed');
  }
}

async function countsByPeriod(actor, periodIds) {
  const rows = await KpiRecord.aggregate([
    {
      $match: {
        organization_id: oid(actor.organization_id),
        reporting_period_id: { $in: periodIds.map(oid) },
        ...recordScopeFilter(actor),
      },
    },
    {
      $group: {
        _id: '$reporting_period_id',
        total: { $sum: 1 },
        approved: {
          $sum: { $cond: [{ $eq: ['$submission_status', RECORD_STATUS.APPROVED] }, 1, 0] },
        },
      },
    },
  ]);
  return new Map(rows.map((r) => [String(r._id), r]));
}

function withCounts(period, counts) {
  const c = counts.get(String(period._id)) || { total: 0, approved: 0 };
  return {
    ...period,
    records_count: c.total,
    approved_count: c.approved,
    approved_pct: c.total ? Math.round((c.approved / c.total) * 1000) / 10 : 0,
  };
}

async function listPeriods(actor, query = {}) {
  const { page, limit, skip, sort } = parsePagination(query, {
    defaultSort: '-period_start_date',
    allowedSort: ['period_start_date', 'period_end_date', 'period_name', 'created_at'],
  });
  const filter = { organization_id: actor.organization_id };
  if (query.period_status) filter.period_status = query.period_status;
  const rx = searchRegex(query.q);
  if (rx) filter.period_name = rx;

  const [rows, total] = await Promise.all([
    ReportingPeriod.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    ReportingPeriod.countDocuments(filter),
  ]);
  const counts = await countsByPeriod(actor, rows.map((r) => r._id));
  return { data: rows.map((r) => withCounts(r, counts)), meta: buildMeta({ page, limit }, total) };
}

async function getPeriod(actor, id) {
  const period = await ReportingPeriod.findOne({
    _id: id,
    organization_id: actor.organization_id,
  }).lean();
  if (!period) throw ApiError.notFound('Reporting period not found');
  const counts = await countsByPeriod(actor, [period._id]);
  return withCounts(period, counts);
}

async function createPeriod(actor, body) {
  return withTransaction(async (session) => {
    const dup = await ReportingPeriod.findOne({
      organization_id: actor.organization_id,
      period_name: body.period_name,
    })
      .session(session)
      .lean();
    if (dup) {
      throw ApiError.conflict('DUPLICATE', 'A period with this name already exists', [
        { field: 'period_name', message: 'Period name already exists' },
      ]);
    }
    const [period] = await ReportingPeriod.create(
      [
        {
          organization_id: actor.organization_id,
          period_name: body.period_name,
          period_start_date: body.period_start_date,
          period_end_date: body.period_end_date,
          period_status: PERIOD_STATUS.IN_PROGRESS,
        },
      ],
      { session },
    );
    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'reporting_period',
      record_id: period._id,
      action_name: 'CREATE',
      updated_value: period,
    });
    return period.toJSON();
  });
}

async function updatePeriod(actor, id, body) {
  return withTransaction(async (session) => {
    const period = await loadPeriod(actor, id, session);
    assertOpen(period);
    const prev = period.toJSON();

    if (body.period_name !== undefined && body.period_name !== period.period_name) {
      const dup = await ReportingPeriod.findOne({
        organization_id: actor.organization_id,
        period_name: body.period_name,
        _id: { $ne: period._id },
      })
        .session(session)
        .lean();
      if (dup) {
        throw ApiError.conflict('DUPLICATE', 'A period with this name already exists', [
          { field: 'period_name', message: 'Period name already exists' },
        ]);
      }
      period.period_name = body.period_name;
    }
    if (body.period_end_date !== undefined) {
      if (body.period_end_date < period.period_start_date) {
        throw ApiError.badRequest('VALIDATION_ERROR', 'End date must be on or after start date', [
          { field: 'period_end_date', message: 'End date must be on or after start date' },
        ]);
      }
      period.period_end_date = body.period_end_date;
    }

    await period.save({ session });
    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'reporting_period',
      record_id: period._id,
      action_name: 'UPDATE',
      previous_value: prev,
      updated_value: period.toJSON(),
    });
    return period.toJSON();
  });
}

/**
 * Validates that owner/approver are active users of the organisation holding
 * the right role (Admin also qualifies) and are different people (BR-4).
 * Shared by record generation and reassignment.
 */
async function validateAssignees(actor, { ownerId, approverId }, session, roleCache = new Map()) {
  if (String(ownerId) === String(approverId)) {
    throw ApiError.unprocessable(
      'OWNER_EQUALS_APPROVER',
      'Data Owner and Approver must be different people',
    );
  }
  const users = await AppUser.find({
    _id: { $in: [ownerId, approverId] },
    organization_id: actor.organization_id,
    is_active: true,
  })
    .session(session)
    .lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));

  const check = async (userId, requiredRole, label) => {
    if (!byId.has(String(userId))) {
      throw ApiError.unprocessable('VALIDATION_ERROR', `${label} must be an active user of your organisation`, [
        { field: label === 'Data Owner' ? 'data_owner_user_id' : 'approver_user_id', message: 'Invalid user' },
      ]);
    }
    let roles = roleCache.get(String(userId));
    if (!roles) {
      roles = await getActiveRoleNames(userId, session);
      roleCache.set(String(userId), roles);
    }
    if (!roles.includes(requiredRole) && !roles.includes(ROLES.ADMIN)) {
      throw ApiError.unprocessable('VALIDATION_ERROR', `${label} must hold the ${requiredRole} or Admin role`, [
        { field: label === 'Data Owner' ? 'data_owner_user_id' : 'approver_user_id', message: `Needs ${requiredRole} role` },
      ]);
    }
  };
  await check(ownerId, ROLES.DATA_OWNER, 'Data Owner');
  await check(approverId, ROLES.APPROVER, 'Approver');
}

/** POST /periods/:id/records — backend.md §8.2, workflow.md §5. */
async function generateRecords(actor, periodId, { assignments, copy_from_period_id }) {
  const result = await withTransaction(async (session) => {
    const period = await loadPeriod(actor, periodId, session);
    assertOpen(period);

    const kpiIds = assignments.map((a) => String(a.kpi_id));
    if (new Set(kpiIds).size !== kpiIds.length) {
      throw ApiError.badRequest('VALIDATION_ERROR', 'Each KPI may appear only once');
    }

    const kpis = await Kpi.find({
      _id: { $in: kpiIds },
      organization_id: actor.organization_id,
      is_active: true,
    })
      .session(session)
      .lean();
    if (kpis.length !== kpiIds.length) {
      throw ApiError.unprocessable('VALIDATION_ERROR', 'All KPIs must be active KPIs of your organisation');
    }
    const kpiById = new Map(kpis.map((k) => [String(k._id), k]));

    const existing = await KpiRecord.find({
      reporting_period_id: period._id,
      kpi_id: { $in: kpiIds },
    })
      .session(session)
      .lean();
    if (existing.length) {
      const codes = existing.map((e) => kpiById.get(String(e.kpi_id))?.kpi_code).filter(Boolean);
      throw ApiError.conflict('DUPLICATE', 'Some KPIs already have a record in this period', {
        kpi_codes: codes,
      });
    }

    // Prefill from a previous period of the same organisation
    let prevByKpi = new Map();
    if (copy_from_period_id) {
      const prevPeriod = await loadPeriod(actor, copy_from_period_id, session);
      const prevRecords = await KpiRecord.find({
        reporting_period_id: prevPeriod._id,
        kpi_id: { $in: kpiIds },
      })
        .session(session)
        .lean({ getters: true });
      prevByKpi = new Map(prevRecords.map((r) => [String(r.kpi_id), r]));
    }

    const roleCache = new Map();
    const docs = [];
    for (const a of assignments) {
      const prev = prevByKpi.get(String(a.kpi_id));
      const ownerId = a.data_owner_user_id || prev?.data_owner_user_id;
      const approverId = a.approver_user_id || prev?.approver_user_id;
      if (!ownerId || !approverId) {
        throw ApiError.unprocessable(
          'VALIDATION_ERROR',
          `KPI ${kpiById.get(String(a.kpi_id)).kpi_code} needs both a Data Owner and an Approver`,
        );
      }
      await validateAssignees(actor, { ownerId, approverId }, session, roleCache);
      docs.push({
        organization_id: actor.organization_id,
        kpi_id: a.kpi_id,
        reporting_period_id: period._id,
        data_owner_user_id: ownerId,
        approver_user_id: approverId,
        actual_value: null,
        target_value: prev?.target_value ?? null,
        baseline_value: prev?.baseline_value ?? null,
        submission_status: RECORD_STATUS.IN_PROGRESS,
      });
    }

    const created = await KpiRecord.insertMany(docs, { session });
    for (const rec of created) {
      await audit.log({
        session,
        user_id: actor.id,
        organization_id: actor.organization_id,
        entity_name: 'kpi_record',
        record_id: rec._id,
        action_name: 'CREATE',
        updated_value: {
          kpi_id: rec.kpi_id,
          reporting_period_id: rec.reporting_period_id,
          data_owner_user_id: rec.data_owner_user_id,
          approver_user_id: rec.approver_user_id,
        },
      });
    }
    return { period: period.toJSON(), created, kpiById };
  });

  // After commit: one assignment email per user and role (workflow.md §5 D7)
  await sendAssignmentEmails(result.period, result.created, result.kpiById);

  return { created_count: result.created.length, records: result.created.map((r) => r.toJSON()) };
}

async function sendAssignmentEmails(period, records, kpiById) {
  const groups = new Map(); // key userId|role → kpis
  for (const r of records) {
    const kpi = kpiById.get(String(r.kpi_id));
    for (const [uid, label] of [
      [r.data_owner_user_id, 'Data Owner'],
      [r.approver_user_id, 'Approver'],
    ]) {
      const key = `${uid}|${label}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(kpi);
    }
  }
  const userIds = [...new Set([...groups.keys()].map((k) => k.split('|')[0]))];
  const users = await AppUser.find({ _id: { $in: userIds } }).lean();
  const userById = new Map(users.map((u) => [String(u._id), u]));
  for (const [key, kpis] of groups) {
    const [uid, roleLabel] = key.split('|');
    const u = userById.get(uid);
    if (!u) continue;
    await notification.sendAssignmentEmail({
      email: u.email,
      display_name: u.display_name,
      roleLabel,
      period_name: period.period_name,
      period_end_date: period.period_end_date,
      kpis,
    });
  }
}

/** POST /periods/:id/close — backend.md §8.6, workflow.md §7. */
async function closePeriod(actor, id, { force = false, reason } = {}) {
  const closed = await withTransaction(async (session) => {
    const period = await loadPeriod(actor, id, session);
    if (period.period_status === PERIOD_STATUS.CLOSED) {
      throw ApiError.conflict('INVALID_TRANSITION', 'This period is already closed');
    }

    const open = await KpiRecord.find({
      reporting_period_id: period._id,
      submission_status: { $ne: RECORD_STATUS.APPROVED },
    })
      .populate('kpi_id', 'kpi_code kpi_name')
      .populate('data_owner_user_id', 'display_name')
      .session(session)
      .lean();

    if (open.length && !force) {
      throw ApiError.conflict(
        'OPEN_RECORDS_EXIST',
        `${open.length} record(s) are not approved yet`,
        open.map((r) => ({
          record_id: String(r._id),
          kpi_code: r.kpi_id?.kpi_code,
          kpi_name: r.kpi_id?.kpi_name,
          status: r.submission_status,
          owner: r.data_owner_user_id?.display_name,
        })),
      );
    }
    if (open.length && force && (!reason || reason.trim().length < 5)) {
      throw ApiError.unprocessable('REASON_REQUIRED', 'A reason of at least 5 characters is required to force close');
    }

    const prev = { period_status: period.period_status };
    period.period_status = PERIOD_STATUS.CLOSED;
    period.closed_at = new Date();
    period.closed_by_user_id = actor._id;
    await period.save({ session });

    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'reporting_period',
      record_id: period._id,
      action_name: 'CLOSE_PERIOD',
      previous_value: prev,
      updated_value: {
        period_status: PERIOD_STATUS.CLOSED,
        forced: Boolean(open.length && force),
        reason: reason || null,
        open_records: open.length,
      },
    });
    return period.toJSON();
  });

  // After commit: summary email to all owners and approvers of the period
  const recs = await KpiRecord.find({ reporting_period_id: closed._id }).lean();
  const ids = [...new Set(recs.flatMap((r) => [String(r.data_owner_user_id), String(r.approver_user_id)]))];
  const users = await AppUser.find({ _id: { $in: ids }, is_active: true }).lean();
  const approved = recs.filter((r) => r.submission_status === RECORD_STATUS.APPROVED).length;
  for (const u of users) {
    await notification.sendTransitionEmail({
      to: u.email,
      subject: `[ESG] Period "${closed.period_name}" closed`,
      body: `Hello ${u.display_name},\n\nReporting period "${closed.period_name}" has been closed.\n${approved} of ${recs.length} KPI records were approved.\n\nAll records in this period are now read-only.`,
    });
  }
  return closed;
}

module.exports = {
  listPeriods,
  getPeriod,
  createPeriod,
  updatePeriod,
  generateRecords,
  closePeriod,
  validateAssignees,
  loadPeriod,
  assertOpen,
};

