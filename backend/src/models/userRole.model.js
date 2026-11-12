'use strict';

const mongoose = require('mongoose');

const userRoleSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      required: true,
      index: true,
    },
    role_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Role',
      required: true,
    },
    assigned_by_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      default: null,
    },
    assigned_at: {
      type: Date,
      default: Date.now,
    },
    is_active: {
      type: Boolean,
      default: true,
    },
  },
  {
    collection: 'user_role',
    timestamps: false,
  },
);

userRoleSchema.index(
  { user_id: 1, role_id: 1 },
  { unique: true, partialFilterExpression: { is_active: true } },
);

module.exports = mongoose.model('UserRole', userRoleSchema);

