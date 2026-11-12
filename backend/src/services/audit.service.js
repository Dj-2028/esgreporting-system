'use strict';

const AuditLog = require('../models/auditLog.model');

const SENSITIVE_KEYS = new Set([
  'password',
  'password_hash',
  'current_password',
  'new_password',
  'token',
  'token_hash',
  'jti_hash',
  'access_token',
  'refresh_token',
]);

function scrub(val) {
  if (val === null || val === undefined) return val;
  if (typeof val !== 'object') return val;
  const plain = typeof val.toJSON === 'function' ? val.toJSON() : val;
  if (Array.isArray(plain)) return plain.map(scrub);
  const out = {};
  for (const [k, v] of Object.entries(plain)) {
    if (SENSITIVE_KEYS.has(k)) continue;
    out[k] = v && typeof v === 'object' && !(v instanceof Date) && !v._bsontype ? scrub(v) : v;
  }
  return out;
}

function serializeAuditValue(val) {
  if (val === null || val === undefined) return null;
  const raw = typeof val === 'string' ? val : JSON.stringify(scrub(val));
  if (raw.length <= 4000) return raw;
  return `${raw.slice(0, 3999)}…`;
}

/**
 * Writes an append-only row to `audit_log` (backend.md §8.11, workflow.md §10).
 * Always passes `{ session }` when a transaction session is active.
 */
async function log({
  session,
  user_id,
  organization_id = null,
  entity_name,
  record_id,
  action_name,
  previous_value = null,
  updated_value = null,
}) {
  const payload = {
    user_id,
    organization_id,
    entity_name,
    record_id,
    action_name,
    previous_value: serializeAuditValue(previous_value),
    updated_value: serializeAuditValue(updated_value),
  };
  const opts = session ? { session } : {};
  const [row] = await AuditLog.create([payload], opts);
  return row;
}

module.exports = { log, serializeAuditValue, scrub };

