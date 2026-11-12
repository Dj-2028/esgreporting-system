'use strict';

const mongoose = require('mongoose');
const { AUDIT_ACTIONS } = require('../config/constants');

const auditLogSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      required: true,
      index: true,
    },
    entity_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    record_id: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },
    action_name: {
      type: String,
      required: true,
      enum: AUDIT_ACTIONS,
      maxlength: 50,
    },
    previous_value: {
      type: String,
      maxlength: 4000,
      default: null,
    },
    updated_value: {
      type: String,
      maxlength: 4000,
      default: null,
    },
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      default: null,
    },
  },
  {
    collection: 'audit_log',
    timestamps: { createdAt: 'created_at', updatedAt: false },
  },
);

auditLogSchema.index({ organization_id: 1, created_at: -1 });
auditLogSchema.index({ entity_name: 1, record_id: 1 });

const blockImmutable = function (next) {
  next(new Error('audit_log is append-only and cannot be modified or deleted'));
};

for (const op of [
  'updateOne',
  'updateMany',
  'findOneAndUpdate',
  'replaceOne',
  'deleteOne',
  'deleteMany',
  'findOneAndDelete',
]) {
  auditLogSchema.pre(op, blockImmutable);
}

module.exports = mongoose.model('AuditLog', auditLogSchema);

