'use strict';

const mongoose = require('mongoose');

const refreshTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      required: true,
      index: true,
    },
    family_id: {
      type: String,
      required: true,
      index: true,
    },
    jti_hash: {
      type: String,
      required: true,
      unique: true,
    },
    expires_at: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    revoked_at: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'refresh_token',
    timestamps: { createdAt: 'created_at', updatedAt: false },
  },
);

module.exports = mongoose.model('RefreshToken', refreshTokenSchema);

