'use strict';

const mongoose = require('mongoose');

const kpiStandardDisclosureSchema = new mongoose.Schema(
  {
    kpi_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Kpi',
      required: true,
    },
    standard_disclosure_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'StandardDisclosure',
      required: true,
      index: true,
    },
  },
  {
    collection: 'kpi_standard_disclosure',
    timestamps: false,
  },
);

kpiStandardDisclosureSchema.index({ kpi_id: 1, standard_disclosure_id: 1 }, { unique: true });

module.exports = mongoose.model('KpiStandardDisclosure', kpiStandardDisclosureSchema);

