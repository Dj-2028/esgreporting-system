'use strict';

const mongoose = require('mongoose');

const roleSchema = new mongoose.Schema(
  {
    role_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    role_description: {
      type: String,
      trim: true,
      maxlength: 500,
      default: '',
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'role',
    timestamps: false,
  },
);

roleSchema.index({ role_name: 1 }, { unique: true });

module.exports = mongoose.model('Role', roleSchema);

