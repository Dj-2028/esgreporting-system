'use strict';

const mongoose = require('mongoose');

const passwordResetTokenSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'AppUser',
      required: true,
      index: true,
    },
    token_hash: {
      type: String,
      required: true,
      unique: true,
    },
    expires_at: {
      type: Date,
      required: true,
      index: { expireAfterSeconds: 0 },
    },
    used_at: {
      type: Date,
      default: null,
    },
  },
  {
    collection: 'password_reset_token',
    timestamps: { createdAt: 'created_at', updatedAt: false },
  },
);

module.exports = mongoose.model('PasswordResetToken', passwordResetTokenSchema);

