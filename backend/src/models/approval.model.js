'use strict';

const mongoose = require('mongoose');
const { APPROVAL_STATUS } = require('../config/constants');

const approvalSchema = new mongoose.Schema(
  {
    kpi_record_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KpiRecord',
      required: true,
    },
    approver_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      required: true,
    },
    approval_status: {
      type: String,
      enum: Object.values(APPROVAL_STATUS),
      required: true,
    },
    comments: {
      type: String,
      trim: true,
      maxlength: 2000,
      default: '',
    },
    reviewed_at: {
      type: Date,
      default: Date.now,
    },
  },
  {
    collection: 'approval',
    timestamps: false,
  },
);

approvalSchema.index({ kpi_record_id: 1, reviewed_at: 1 });

module.exports = mongoose.model('Approval', approvalSchema);

