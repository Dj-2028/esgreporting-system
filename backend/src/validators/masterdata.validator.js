'use strict';

const { z } = require('zod');
const { objectId, email, shortCode, kpiFrequency } = require('./common.validator');

const patchOrganizationBody = z
  .object({
    organization_name: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

const createDepartmentBody = z.object({
  department_name: z.string().trim().min(1, 'Department name is required').max(150),
  department_code: shortCode,
});

const patchDepartmentBody = z.object({
  department_name: z.string().trim().min(1).max(150).optional(),
  department_code: shortCode.optional(),
  is_active: z.boolean().optional(),
  reassign_to_department_id: objectId.optional(),
});

const createUserBody = z.object({
  email,
  display_name: z.string().trim().min(1, 'Display name is required').max(150),
  department_id: objectId.nullable().optional(),
  role_ids: z.array(objectId).min(1, 'Select at least one role'),
});

const patchUserBody = z.object({
  display_name: z.string().trim().min(1).max(150).optional(),
  department_id: objectId.nullable().optional(),
  is_active: z.boolean().optional(),
});

const assignRoleBody = z.object({
  role_id: objectId,
});

const revokeRoleParams = z.object({
  id: objectId,
  user_role_id: objectId,
});

const patchPillarBody = z.object({
  pillar_description: z.string().trim().max(500).optional(),
  is_active: z.boolean().optional(),
});

const createStandardBody = z.object({
  standard_code: z.string().trim().toUpperCase().min(1).max(30),
  standard_name: z.string().trim().min(1).max(150),
  version_label: z.string().trim().min(1).max(50),
  issuing_body: z.string().trim().max(150).optional().default(''),
});

const patchStandardBody = z.object({
  standard_name: z.string().trim().min(1).max(150).optional(),
  version_label: z.string().trim().min(1).max(50).optional(),
  issuing_body: z.string().trim().max(150).optional(),
  is_active: z.boolean().optional(),
});

const putStandardPillarsBody = z.object({
  esg_pillar_ids: z.array(objectId),
});

const createDisclosureBody = z.object({
  disclosure_code: z.string().trim().min(1).max(50),
  disclosure_title: z.string().trim().min(1).max(255),
  disclosure_description: z.string().trim().max(1000).optional().default(''),
  is_mandatory: z.boolean().optional().default(false),
});

const patchDisclosureBody = z.object({
  disclosure_code: z.string().trim().min(1).max(50).optional(),
  disclosure_title: z.string().trim().min(1).max(255).optional(),
  disclosure_description: z.string().trim().max(1000).optional(),
  is_mandatory: z.boolean().optional(),
});

const createKpiBody = z.object({
  esg_pillar_id: objectId,
  kpi_code: shortCode,
  kpi_name: z.string().trim().min(1).max(255),
  unit_of_measurement: z.string().trim().min(1).max(50),
  calculation_method: z.string().trim().max(1000).optional().default(''),
  frequency: kpiFrequency.optional().default('Annual'),
  standard_disclosure_ids: z.array(objectId).optional().default([]),
});

const patchKpiBody = z.object({
  esg_pillar_id: objectId.optional(),
  kpi_code: shortCode.optional(),
  kpi_name: z.string().trim().min(1).max(255).optional(),
  unit_of_measurement: z.string().trim().min(1).max(50).optional(),
  calculation_method: z.string().trim().max(1000).optional(),
  frequency: kpiFrequency.optional(),
  is_active: z.boolean().optional(),
});

const putKpiDisclosuresBody = z.object({
  standard_disclosure_ids: z.array(objectId),
});

module.exports = {
  patchOrganizationBody,
  createDepartmentBody,
  patchDepartmentBody,
  createUserBody,
  patchUserBody,
  assignRoleBody,
  revokeRoleParams,
  patchPillarBody,
  createStandardBody,
  patchStandardBody,
  putStandardPillarsBody,
  createDisclosureBody,
  patchDisclosureBody,
  createKpiBody,
  patchKpiBody,
  putKpiDisclosuresBody,
};

