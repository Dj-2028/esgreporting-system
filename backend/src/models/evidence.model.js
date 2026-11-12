'use strict';

const mongoose = require('mongoose');

const evidenceSchema = new mongoose.Schema(
  {
    kpi_record_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'KpiRecord',
      required: true,
      index: true,
    },
    uploaded_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      required: true,
    },
    file_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    file_url: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },
    file_hash: {
      type: String,
      required: true,
      trim: true,
      maxlength: 128,
    },
    mime_type: {
      type: String,
      trim: true,
      default: '',
    },
    file_size_bytes: {
      type: Number,
      default: 0,
    },
    uploaded_at: {
      type: Date,
      default: Date.now,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'evidence',
    timestamps: false,
  },
);

evidenceSchema.index(
  { kpi_record_id: 1, file_hash: 1 },
  { unique: true, partialFilterExpression: { is_active: true } },
);

module.exports = mongoose.model('Evidence', evidenceSchema);

