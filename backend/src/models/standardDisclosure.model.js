'use strict';

const mongoose = require('mongoose');

const standardDisclosureSchema = new mongoose.Schema(
  {
    esg_standard_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EsgStandard',
      required: true,
    },
    disclosure_code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    disclosure_title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    disclosure_description: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    is_mandatory: {
      type: Boolean,
      default: false,
    },
  },
  {
    collection: 'standard_disclosure',
    timestamps: false,
  },
);

standardDisclosureSchema.index({ esg_standard_id: 1, disclosure_code: 1 }, { unique: true });

module.exports = mongoose.model('StandardDisclosure', standardDisclosureSchema);

