'use strict';

const mongoose = require('mongoose');

const esgPillarSchema = new mongoose.Schema(
  {
    pillar_code: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 20,
    },
    pillar_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    pillar_description: {
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
    collection: 'esg_pillar',
    timestamps: false,
  },
);

esgPillarSchema.index({ pillar_code: 1 }, { unique: true });
esgPillarSchema.index({ pillar_name: 1 }, { unique: true });

module.exports = mongoose.model('EsgPillar', esgPillarSchema);

