'use strict';

const mongoose = require('mongoose');
const { RECORD_STATUS } = require('../config/constants');

function decimalToNumber(val) {
  if (val === null || val === undefined) return null;
  if (typeof val === 'number') return val;
  const num = Number(val.toString());
  return Number.isNaN(num) ? null : num;
}

const kpiRecordSchema = new mongoose.Schema(
  {
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    kpi_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Kpi',
      required: true,
    },
    reporting_period_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'ReportingPeriod',
      required: true,
    },
    data_owner_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      required: true,
      index: true,
    },
    approver_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      required: true,
      index: true,
    },
    actual_value: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
      get: decimalToNumber,
    },
    target_value: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
      get: decimalToNumber,
    },
    baseline_value: {
      type: mongoose.Schema.Types.Decimal128,
      default: null,
      get: decimalToNumber,
    },
    submission_status: {
      type: String,
      enum: Object.values(RECORD_STATUS),
      default: RECORD_STATUS.IN_PROGRESS,
    },
    submitted_at: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'kpi_record',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
    toJSON: { getters: true },
    toObject: { getters: true },
  },
);

kpiRecordSchema.index({ kpi_id: 1, reporting_period_id: 1 }, { unique: true });
kpiRecordSchema.index({ organization_id: 1, reporting_period_id: 1, submission_status: 1 });

module.exports = mongoose.model('KpiRecord', kpiRecordSchema);

