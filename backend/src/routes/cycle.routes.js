'use strict';

const express = require('express');
const { ROLES } = require('../config/constants');
const authenticate = require('../middleware/authenticate');
const { authorize } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { uploadSingleEvidence } = require('../middleware/upload');
const { idParamSchema } = require('../validators/common.validator');
const v = require('../validators/cycle.validator');
const ctrl = require('../controllers/cycle.controller');

const router = express.Router();
const { ADMIN, DATA_OWNER, APPROVER, VIEWER } = ROLES;

router.use(
  ['/periods', '/records', '/evidence', '/dashboard', '/reports', '/audit-logs', '/tools'],
  authenticate,
);

// 7.7 Reporting periods
router.get('/periods', ctrl.listPeriods);
router.post('/periods', authorize(ADMIN), validate({ body: v.createPeriodBody }), ctrl.createPeriod);
router.get('/periods/:id', validate({ params: idParamSchema }), ctrl.getPeriod);
router.patch(
  '/periods/:id',
  authorize(ADMIN),
  validate({ params: idParamSchema, body: v.patchPeriodBody }),
  ctrl.updatePeriod,
);
router.post(
  '/periods/:id/records',
  authorize(ADMIN),
  validate({ params: idParamSchema, body: v.generateRecordsBody }),
  ctrl.generateRecords,
);
router.post(
  '/periods/:id/close',
  authorize(ADMIN),
  validate({ params: idParamSchema, body: v.closePeriodBody }),
  ctrl.closePeriod,
);

// 7.8 KPI records
router.get('/records', validate({ query: v.recordListQuery }), ctrl.listRecords);
router.get('/records/:id', validate({ params: idParamSchema }), ctrl.getRecord);
router.patch(
  '/records/:id',
  authorize(DATA_OWNER, ADMIN),
  validate({ params: idParamSchema, body: v.patchRecordValuesBody }),
  ctrl.updateRecord,
);
router.patch(
  '/records/:id/assignment',
  authorize(ADMIN),
  validate({ params: idParamSchema, body: v.patchRecordAssignmentBody }),
  ctrl.reassignRecord,
);
router.post('/records/:id/submit', authorize(DATA_OWNER, ADMIN), validate({ params: idParamSchema }), ctrl.submitRecord);
router.post(
  '/records/:id/approve',
  authorize(APPROVER, ADMIN),
  validate({ params: idParamSchema, body: v.approveRecordBody }),
  ctrl.approveRecord,
);
router.post(
  '/records/:id/reject',
  authorize(APPROVER, ADMIN),
  validate({ params: idParamSchema, body: v.rejectRecordBody }),
  ctrl.rejectRecord,
);
router.post(
  '/records/:id/reopen',
  authorize(ADMIN),
  validate({ params: idParamSchema, body: v.reopenRecordBody }),
  ctrl.reopenRecord,
);
router.get('/records/:id/approvals', validate({ params: idParamSchema }), ctrl.listApprovals);
router.get('/records/:id/history', validate({ params: idParamSchema }), ctrl.listHistory);

// 7.9 Evidence
router.post(
  '/records/:id/evidence',
  authorize(DATA_OWNER, ADMIN),
  validate({ params: idParamSchema }),
  uploadSingleEvidence,
  ctrl.uploadEvidence,
);
router.get('/records/:id/evidence', validate({ params: idParamSchema }), ctrl.listEvidence);
router.get('/evidence/:id/download', validate({ params: idParamSchema }), ctrl.downloadEvidence);
router.delete('/evidence/:id', authorize(DATA_OWNER, ADMIN), validate({ params: idParamSchema }), ctrl.removeEvidence);

// 7.10 Dashboard
router.get('/dashboard', ctrl.getDashboard);

// 7.11 Reports and export
router.get('/reports/pillar-totals', authorize(ADMIN, VIEWER), ctrl.pillarTotals);
router.get('/reports/content-index', authorize(ADMIN, VIEWER), ctrl.contentIndex);
router.get('/reports/kpi-trend', authorize(ADMIN, VIEWER), ctrl.kpiTrend);
router.get('/reports/export', authorize(ADMIN, VIEWER), ctrl.exportReport);

// 7.12 Audit log
router.get('/audit-logs', authorize(ADMIN, VIEWER), ctrl.listAuditLogs);

// 7.13 Tools
router.post('/tools/emissions-calc', validate({ body: v.emissionsCalcBody }), ctrl.emissionsCalc);

module.exports = router;

