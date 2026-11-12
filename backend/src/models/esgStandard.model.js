'use strict';

const mongoose = require('mongoose');

const esgStandardSchema = new mongoose.Schema(
  {
    standard_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 30,
    },
    standard_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    version_label: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    issuing_body: {
      type: String,
      trim: true,
      maxlength: 150,
      default: '',
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'esg_standard',
    timestamps: false,
  },
);

esgStandardSchema.index({ standard_code: 1 }, { unique: true });

module.exports = mongoose.model('EsgStandard', esgStandardSchema);

