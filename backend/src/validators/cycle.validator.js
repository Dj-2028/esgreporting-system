'use strict';

const { z } = require('zod');
const { objectId, decimalValue, reasonText, remarkText } = require('./common.validator');

const createPeriodBody = z
  .object({
    period_name: z.string().trim().min(1, 'Period name is required').max(100),
    period_start_date: z.coerce.date(),
    period_end_date: z.coerce.date(),
  })
  .refine((d) => d.period_end_date >= d.period_start_date, {
    path: ['period_end_date'],
    message: 'End date must be on or after start date',
  });

const patchPeriodBody = z.object({
  period_name: z.string().trim().min(1).max(100).optional(),
  period_end_date: z.coerce.date().optional(),
});

const generateRecordsBody = z.object({
  assignments: z
    .array(
      z.object({
        kpi_id: objectId,
        data_owner_user_id: objectId.optional(),
        approver_user_id: objectId.optional(),
      }),
    )
    .min(1, 'Select at least one KPI'),
  copy_from_period_id: objectId.optional(),
});

const closePeriodBody = z.object({
  force: z.boolean().optional().default(false),
  reason: z.string().trim().max(500).optional(),
});

const patchRecordValuesBody = z.object({
  actual_value: decimalValue.nullable().optional(),
  target_value: decimalValue.nullable().optional(),
  baseline_value: decimalValue.nullable().optional(),
  updated_at: z.string().min(1, 'updated_at concurrency token is required'),
});

const patchRecordAssignmentBody = z
  .object({
    data_owner_user_id: objectId.optional(),
    approver_user_id: objectId.optional(),
  })
  .refine((b) => b.data_owner_user_id !== undefined || b.approver_user_id !== undefined, {
    message: 'Provide data_owner_user_id and/or approver_user_id',
  });

const approveRecordBody = z.object({
  comments: z.string().trim().max(2000).optional().default(''),
});

// Reject remark is validated in the service so the client gets 422 REMARK_REQUIRED.
const rejectRecordBody = z.object({
  comments: z.string().max(2000).optional().default(''),
});

const reopenRecordBody = z.object({
  reason: z.string().max(500).optional().default(''),
});

const recordListQuery = z.object({
  reporting_period_id: objectId,
  submission_status: z.string().optional(),
  esg_pillar_id: objectId.optional(),
  department_id: objectId.optional(),
  data_owner_user_id: objectId.optional(),
  approver_user_id: objectId.optional(),
  scope: z.enum(['mine', 'my_approvals']).optional(),
  q: z.string().optional(),
  page: z.string().optional(),
  limit: z.string().optional(),
  sort: z.string().optional(),
});

const emissionsCalcBody = z.object({
  scope: z.coerce.number().int().min(1).max(3),
  activity_data: z.number().positive('Activity data must be greater than 0'),
  activity_unit: z.string().trim().min(1, 'Activity unit is required').max(50),
  emission_factor_kg_per_unit: z.number().min(0, 'Emission factor must be 0 or greater'),
});

module.exports = {
  createPeriodBody,
  patchPeriodBody,
  generateRecordsBody,
  closePeriodBody,
  patchRecordValuesBody,
  patchRecordAssignmentBody,
  approveRecordBody,
  rejectRecordBody,
  reopenRecordBody,
  recordListQuery,
  emissionsCalcBody,
  reasonText,
  remarkText,
};

