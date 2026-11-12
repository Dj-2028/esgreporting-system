'use strict';

const mongoose = require('mongoose');
const { PERIOD_STATUS } = require('../config/constants');

const reportingPeriodSchema = new mongoose.Schema(
  {
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    period_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    period_start_date: {
      type: Date,
      required: true,
    },
    period_end_date: {
      type: Date,
      required: true,
    },
    period_status: {
      type: String,
      enum: Object.values(PERIOD_STATUS),
      default: PERIOD_STATUS.IN_PROGRESS,
    },
    closed_at: {
      type: Date,
      default: null,
    },
    closed_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      default: null,
    },
  },
  {
    collection: 'reporting_period',
    timestamps: { createdAt: 'created_at', updatedAt: false },
  },
);

reportingPeriodSchema.index({ organization_id: 1, period_name: 1 }, { unique: true });
reportingPeriodSchema.index({ organization_id: 1, period_status: 1 });

module.exports = mongoose.model('ReportingPeriod', reportingPeriodSchema);

