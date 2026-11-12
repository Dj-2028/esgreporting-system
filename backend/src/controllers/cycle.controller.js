'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, list, noContent } = require('../utils/respond');
const periodService = require('../services/period.service');
const recordService = require('../services/kpiRecord.service');
const evidenceService = require('../services/evidence.service');
const dashboardService = require('../services/dashboard.service');
const reportService = require('../services/report.service');
const emissionService = require('../services/emission.service');

// Periods
const listPeriods = asyncHandler(async (req, res) => {
  const { data, meta } = await periodService.listPeriods(req.user, req.query);
  return list(res, data, meta);
});
const createPeriod = asyncHandler(async (req, res) => created(res, await periodService.createPeriod(req.user, req.body)));
const getPeriod = asyncHandler(async (req, res) => ok(res, await periodService.getPeriod(req.user, req.params.id)));
const updatePeriod = asyncHandler(async (req, res) =>
  ok(res, await periodService.updatePeriod(req.user, req.params.id, req.body)),
);
const generateRecords = asyncHandler(async (req, res) =>
  created(res, await periodService.generateRecords(req.user, req.params.id, req.body)),
);
const closePeriod = asyncHandler(async (req, res) =>
  ok(res, await periodService.closePeriod(req.user, req.params.id, req.body)),
);

// Records
const listRecords = asyncHandler(async (req, res) => {
  const { data, meta } = await recordService.listRecords(req.user, req.validatedQuery);
  return list(res, data, meta);
});
const getRecord = asyncHandler(async (req, res) => ok(res, await recordService.getRecord(req.user, req.params.id)));
const updateRecord = asyncHandler(async (req, res) =>
  ok(res, await recordService.updateValues(req.user, req.params.id, req.body)),
);
const reassignRecord = asyncHandler(async (req, res) =>
  ok(res, await recordService.reassign(req.user, req.params.id, req.body)),
);
const transitionHandler = (action) =>
  asyncHandler(async (req, res) => ok(res, await recordService.transition(req.user, req.params.id, action, req.body)));
const listApprovals = asyncHandler(async (req, res) => ok(res, await recordService.listApprovals(req.user, req.params.id)));
const listHistory = asyncHandler(async (req, res) => ok(res, await recordService.listHistory(req.user, req.params.id)));

// Evidence
const uploadEvidence = asyncHandler(async (req, res) =>
  created(res, await evidenceService.upload(req.user, req.params.id, req.file)),
);
const listEvidence = asyncHandler(async (req, res) => ok(res, await evidenceService.list(req.user, req.params.id)));
const downloadEvidence = asyncHandler(async (req, res) => {
  const { stream, headers } = await evidenceService.openDownload(req.user, req.params.id, {
    inline: req.query.inline === '1' || req.query.inline === 'true',
  });
  for (const [k, v] of Object.entries(headers)) if (v !== undefined) res.setHeader(k, v);
  stream.on('error', (err) => res.destroy(err));
  stream.pipe(res);
});
const removeEvidence = asyncHandler(async (req, res) => {
  await evidenceService.remove(req.user, req.params.id);
  return noContent(res);
});

// Dashboard, reports, audit, tools
const getDashboard = asyncHandler(async (req, res) => ok(res, await dashboardService.getDashboard(req.user, req.query)));
const pillarTotals = asyncHandler(async (req, res) => ok(res, await reportService.pillarTotals(req.user, req.query)));
const contentIndex = asyncHandler(async (req, res) => ok(res, await reportService.contentIndex(req.user, req.query)));
const kpiTrend = asyncHandler(async (req, res) => ok(res, await reportService.kpiTrend(req.user, req.query)));
const exportReport = asyncHandler(async (req, res) => {
  const { buffer, contentType, filename, rowCount } = await reportService.exportReport(req.user, req.query);
  res.setHeader('Content-Type', contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.setHeader('X-Row-Count', String(rowCount));
  res.setHeader('X-Content-Type-Options', 'nosniff');
  return res.status(200).send(buffer);
});
const listAuditLogs = asyncHandler(async (req, res) => {
  const { data, meta } = await reportService.listAuditLogs(req.user, req.query);
  return list(res, data, meta);
});
const emissionsCalc = asyncHandler(async (req, res) => ok(res, emissionService.calculate(req.body)));

module.exports = {
  listPeriods,
  createPeriod,
  getPeriod,
  updatePeriod,
  generateRecords,
  closePeriod,
  listRecords,
  getRecord,
  updateRecord,
  reassignRecord,
  submitRecord: transitionHandler('submit'),
  approveRecord: transitionHandler('approve'),
  rejectRecord: transitionHandler('reject'),
  reopenRecord: transitionHandler('reopen'),
  listApprovals,
  listHistory,
  uploadEvidence,
  listEvidence,
  downloadEvidence,
  removeEvidence,
  getDashboard,
  pillarTotals,
  contentIndex,
  kpiTrend,
  exportReport,
  listAuditLogs,
  emissionsCalc,
};

