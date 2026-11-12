'use strict';

const mongoose = require('mongoose');

const standardPillarSchema = new mongoose.Schema(
  {
    esg_standard_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EsgStandard',
      required: true,
    },
    esg_pillar_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EsgPillar',
      required: true,
    },
  },
  {
    collection: 'standard_pillar',
    timestamps: false,
  },
);

standardPillarSchema.index({ esg_standard_id: 1, esg_pillar_id: 1 }, { unique: true });

module.exports = mongoose.model('StandardPillar', standardPillarSchema);

