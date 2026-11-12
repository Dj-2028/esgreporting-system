'use strict';

const mongoose = require('mongoose');

const organizationSchema = new mongoose.Schema(
  {
    organization_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
    },
    organization_code: {
      type: String,
      required: true,
      uppercase: true,
      trim: true,
      maxlength: 50,
      match: /^[A-Z0-9_-]{2,50}$/,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'organization',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

organizationSchema.index({ organization_name: 1 }, { unique: true });
organizationSchema.index({ organization_code: 1 }, { unique: true });

module.exports = mongoose.model('Organization', organizationSchema);

