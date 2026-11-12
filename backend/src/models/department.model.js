'use strict';

const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema(
  {
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
      index: true,
    },
    department_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    department_code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'department',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

departmentSchema.index({ organization_id: 1, department_code: 1 }, { unique: true });

module.exports = mongoose.model('Department', departmentSchema);

