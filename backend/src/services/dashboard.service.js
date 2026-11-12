'use strict';

const mongoose = require('mongoose');
const { ROLES, RECORD_STATUS, PERIOD_STATUS } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const { recordScopeFilter, hasRole } = require('./recordAccess');
const { ReportingPeriod, KpiRecord, EsgPillar } = require('../models');

const oid = (v) => new mongoose.Types.ObjectId(String(v));
const STATUSES = Object.values(RECORD_STATUS);

function emptyByStatus() {
  return Object.fromEntries(STATUSES.map((s) => [s, 0]));
}

/** Default period: latest In Progress, else the most recent one. */
async function resolvePeriod(actor, periodId) {
  if (periodId) {
    const p = await ReportingPeriod.findOne({ _id: periodId, organization_id: actor.organization_id }).lean();
    if (!p) throw ApiError.notFound('Reporting period not found');
    return p;
  }
  return (
    (await ReportingPeriod.findOne({ organization_id: actor.organization_id, period_status: PERIOD_STATUS.IN_PROGRESS })
      .sort({ period_start_date: -1 })
      .lean()) ||
    (await ReportingPeriod.findOne({ organization_id: actor.organization_id }).sort({ period_start_date: -1 }).lean())
  );
}

/** GET /dashboard — backend.md §7.10, §8.7; workflow.md §8.1. */
async function getDashboard(actor, { reporting_period_id } = {}) {
  const period = await resolvePeriod(actor, reporting_period_id);
  const pillars = await EsgPillar.find().sort({ pillar_code: 1 }).lean();

  if (!period) {
    return {
      period: null,
      scope: 'organization',
      totals: { total: 0, by_status: emptyByStatus(), completion_pct: 0, overdue: 0 },
      by_pillar: [],
      by_department: [],
    };
  }

  const scopeFilter = recordScopeFilter(actor);
  const isOrgWide = Object.keys(scopeFilter).length === 0;
  const overdueCutoff = new Date(period.period_end_date) < new Date();

  const [agg] = await KpiRecord.aggregate([
    { $match: { organization_id: oid(actor.organization_id), reporting_period_id: period._id, ...scopeFilter } },
    { $lookup: { from: 'kpi', localField: 'kpi_id', foreignField: '_id', as: 'kpi' } },
    { $unwind: '$kpi' },
    { $lookup: { from: 'app_user', localField: 'data_owner_user_id', foreignField: '_id', as: 'owner' } },
    { $unwind: { path: '$owner', preserveNullAndEmptyArrays: true } },
    {
      $facet: {
        by_status: [{ $group: { _id: '$submission_status', count: { $sum: 1 } } }],
        by_pillar: [
          { $group: { _id: { p: '$kpi.esg_pillar_id', s: '$submission_status' }, count: { $sum: 1 } } },
        ],
        by_department: [
          {
            $group: {
              _id: '$owner.department_id',
              total: { $sum: 1 },
              approved: { $sum: { $cond: [{ $eq: ['$submission_status', RECORD_STATUS.APPROVED] }, 1, 0] } },
            },
          },
          { $lookup: { from: 'department', localField: '_id', foreignField: '_id', as: 'dept' } },
          { $unwind: { path: '$dept', preserveNullAndEmptyArrays: true } },
        ],
        unassigned: [
          { $match: { 'owner.is_active': { $ne: true } } },
          { $count: 'n' },
        ],
      },
    },
  ]);

  const byStatus = emptyByStatus();
  for (const row of agg.by_status) byStatus[row._id] = row.count;
  const total = STATUSES.reduce((sum, s) => sum + byStatus[s], 0);
  const approved = byStatus[RECORD_STATUS.APPROVED];

  const pillarRows = new Map();
  for (const row of agg.by_pillar) {
    const key = String(row._id.p);
    if (!pillarRows.has(key)) pillarRows.set(key, { total: 0, by_status: emptyByStatus() });
    const entry = pillarRows.get(key);
    entry.by_status[row._id.s] = row.count;
    entry.total += row.count;
  }
  const byPillar = pillars
    .filter((p) => pillarRows.has(String(p._id)))
    .map((p) => {
      const e = pillarRows.get(String(p._id));
      return {
        pillar_id: String(p._id),
        pillar_code: p.pillar_code,
        pillar_name: p.pillar_name,
        total: e.total,
        by_status: e.by_status,
        completion_pct: e.total ? round1((e.by_status[RECORD_STATUS.APPROVED] / e.total) * 100) : 0,
      };
    });

  const showDepartments = hasRole(actor, ROLES.ADMIN) || hasRole(actor, ROLES.VIEWER);
  const byDepartment = showDepartments
    ? agg.by_department
        .map((d) => ({
          department_id: d._id ? String(d._id) : null,
          department_name: d.dept ? d.dept.department_name : 'No department',
          total: d.total,
          approved: d.approved,
          completion_pct: d.total ? round1((d.approved / d.total) * 100) : 0,
        }))
        .sort((a, b) => b.completion_pct - a.completion_pct)
    : [];

  return {
    period: {
      id: String(period._id),
      period_name: period.period_name,
      period_start_date: period.period_start_date,
      period_end_date: period.period_end_date,
      period_status: period.period_status,
    },
    scope: isOrgWide ? 'organization' : 'mine',
    totals: {
      total,
      by_status: byStatus,
      completion_pct: total ? round1((approved / total) * 100) : 0,
      overdue: overdueCutoff ? total - approved : 0,
      unassigned_owner: agg.unassigned[0]?.n || 0,
    },
    by_pillar: byPillar,
    by_department: byDepartment,
  };
}

function round1(n) {
  return Math.round(n * 10) / 10;
}

module.exports = { getDashboard, resolvePeriod };

