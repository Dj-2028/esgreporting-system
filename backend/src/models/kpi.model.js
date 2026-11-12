'use strict';

const mongoose = require('mongoose');
const { KPI_FREQUENCY } = require('../config/constants');

const kpiSchema = new mongoose.Schema(
  {
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    esg_pillar_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'EsgPillar',
      required: true,
    },
    kpi_code: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    kpi_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    unit_of_measurement: {
      type: String,
      required: true,
      trim: true,
      maxlength: 50,
    },
    calculation_method: {
      type: String,
      trim: true,
      maxlength: 1000,
      default: '',
    },
    frequency: {
      type: String,
      enum: KPI_FREQUENCY,
      default: 'Annual',
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'kpi',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

kpiSchema.index({ organization_id: 1, kpi_code: 1 }, { unique: true });
kpiSchema.index({ organization_id: 1, esg_pillar_id: 1, is_active: 1 });

module.exports = mongoose.model('Kpi', kpiSchema);

