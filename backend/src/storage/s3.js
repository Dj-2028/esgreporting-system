'use strict';

/**
 * S3-compatible driver placeholder with the same `{ put, createReadStream, remove }`
 * interface as local.js. Implemented in Phase 5 (production hardening) with
 * @aws-sdk/client-s3; selecting it before then fails loudly.
 */
function notConfigured() {
  throw new Error('S3 storage driver is not implemented yet (Phase 5). Use STORAGE_DRIVER=local.');
}

module.exports = { put: notConfigured, createReadStream: notConfigured, remove: notConfigured };

