'use strict';

const express = require('express');
const { ROLES } = require('../config/constants');
const authenticate = require('../middleware/authenticate');
const { authorize, requirePlatformAdmin } = require('../middleware/authorize');
const validate = require('../middleware/validate');
const { idParamSchema } = require('../validators/common.validator');
const v = require('../validators/masterdata.validator');
const ctrl = require('../controllers/masterdata.controller');

const router = express.Router();

// Authenticate only this router's own paths so unknown routes still 404.
router.use(
  [
    '/organizations',
    '/departments',
    '/users',
    '/roles',
    '/pillars',
    '/standards',
    '/disclosures',
    '/kpis',
  ],
  authenticate,
);

// 7.2 Organisation
router.get('/organizations/current', ctrl.getCurrentOrganization);
router.patch(
  '/organizations/current',
  authorize(ROLES.ADMIN),
  validate({ body: v.patchOrganizationBody }),
  ctrl.updateCurrentOrganization,
);

// 7.3 Departments
router.get('/departments', ctrl.listDepartments);
router.post(
  '/departments',
  authorize(ROLES.ADMIN),
  validate({ body: v.createDepartmentBody }),
  ctrl.createDepartment,
);
router.get('/departments/:id', validate({ params: idParamSchema }), ctrl.getDepartment);
router.patch(
  '/departments/:id',
  authorize(ROLES.ADMIN),
  validate({ params: idParamSchema, body: v.patchDepartmentBody }),
  ctrl.updateDepartment,
);

// 7.4 Users and Roles
router.get('/users', ctrl.listUsers);
router.post(
  '/users',
  authorize(ROLES.ADMIN),
  validate({ body: v.createUserBody }),
  ctrl.createUser,
);
router.get(
  '/users/:id',
  authorize(ROLES.ADMIN, ROLES.VIEWER),
  validate({ params: idParamSchema }),
  ctrl.getUser,
);
router.patch(
  '/users/:id',
  authorize(ROLES.ADMIN),
  validate({ params: idParamSchema, body: v.patchUserBody }),
  ctrl.updateUser,
);
router.post(
  '/users/:id/roles',
  authorize(ROLES.ADMIN),
  validate({ params: idParamSchema, body: v.assignRoleBody }),
  ctrl.assignRole,
);
router.delete(
  '/users/:id/roles/:user_role_id',
  authorize(ROLES.ADMIN),
  validate({ params: v.revokeRoleParams }),
  ctrl.revokeRole,
);
router.get('/roles', ctrl.listRoles);

// 7.5 Pillars, Standards, Disclosures
router.get('/pillars', ctrl.listPillars);
router.patch(
  '/pillars/:id',
  requirePlatformAdmin,
  validate({ params: idParamSchema, body: v.patchPillarBody }),
  ctrl.updatePillar,
);

router.get('/standards', ctrl.listStandards);
router.post(
  '/standards',
  requirePlatformAdmin,
  validate({ body: v.createStandardBody }),
  ctrl.createStandard,
);
router.patch(
  '/standards/:id',
  requirePlatformAdmin,
  validate({ params: idParamSchema, body: v.patchStandardBody }),
  ctrl.updateStandard,
);
router.put(
  '/standards/:id/pillars',
  requirePlatformAdmin,
  validate({ params: idParamSchema, body: v.putStandardPillarsBody }),
  ctrl.replaceStandardPillars,
);
router.get(
  '/standards/:id/disclosures',
  validate({ params: idParamSchema }),
  ctrl.listDisclosures,
);
router.post(
  '/standards/:id/disclosures',
  requirePlatformAdmin,
  validate({ params: idParamSchema, body: v.createDisclosureBody }),
  ctrl.createDisclosure,
);
router.patch(
  '/disclosures/:id',
  requirePlatformAdmin,
  validate({ params: idParamSchema, body: v.patchDisclosureBody }),
  ctrl.updateDisclosure,
);
router.delete(
  '/disclosures/:id',
  requirePlatformAdmin,
  validate({ params: idParamSchema }),
  ctrl.deleteDisclosure,
);

// 7.6 KPIs
router.get('/kpis', ctrl.listKpis);
router.post(
  '/kpis',
  authorize(ROLES.ADMIN),
  validate({ body: v.createKpiBody }),
  ctrl.createKpi,
);
router.get('/kpis/:id', validate({ params: idParamSchema }), ctrl.getKpi);
router.patch(
  '/kpis/:id',
  authorize(ROLES.ADMIN),
  validate({ params: idParamSchema, body: v.patchKpiBody }),
  ctrl.updateKpi,
);
router.put(
  '/kpis/:id/disclosures',
  authorize(ROLES.ADMIN),
  validate({ params: idParamSchema, body: v.putKpiDisclosuresBody }),
  ctrl.replaceKpiDisclosures,
);

module.exports = router;
