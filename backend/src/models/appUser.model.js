'use strict';

const mongoose = require('mongoose');

const appUserSchema = new mongoose.Schema(
  {
    organization_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Organization',
      required: true,
    },
    department_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Department',
      default: null,
    },
    email: {
      type: String,
      required: true,
      lowercase: true,
      trim: true,
      maxlength: 255,
    },
    display_name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 150,
    },
    password_hash: {
      type: String,
      required: true,
      select: false,
    },
    must_change_password: {
      type: Boolean,
      default: false,
    },
    last_login_at: {
      type: Date,
      default: null,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'app_user',
    timestamps: { createdAt: 'created_at', updatedAt: 'updated_at' },
  },
);

appUserSchema.index({ email: 1 }, { unique: true });
appUserSchema.index({ organization_id: 1, is_active: 1 });
appUserSchema.index({ department_id: 1 });

appUserSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.password_hash;
    return ret;
  },
});

module.exports = mongoose.model('AppUser', appUserSchema);

