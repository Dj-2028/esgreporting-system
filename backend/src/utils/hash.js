'use strict';

const crypto = require('crypto');

/** SHA-256 hex digest of a Buffer or string (evidence hashing, token hashing). */
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest('hex');
}

/** URL-safe random token (refresh JTI, password-reset token). */
function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

module.exports = { sha256, randomToken };

