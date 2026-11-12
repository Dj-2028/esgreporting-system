'use strict';

const mongoose = require('mongoose');
const { ROLES } = require('../config/constants');

/**
 * Record visibility (backend.md §7.8): Admin and Viewer see every record in
 * the organisation; Data Owners see records they own; Approvers see records
 * they approve. A user with several roles sees the union.
 * Returns a Mongo filter fragment (empty object = no extra restriction).
 */
function recordScopeFilter(actor) {
  const roles = actor.roles || [];
  if (roles.includes(ROLES.ADMIN) || roles.includes(ROLES.VIEWER)) return {};
  const uid = new mongoose.Types.ObjectId(String(actor.id));
  const or = [];
  if (roles.includes(ROLES.DATA_OWNER)) or.push({ data_owner_user_id: uid });
  if (roles.includes(ROLES.APPROVER)) or.push({ approver_user_id: uid });
  if (!or.length) return { _id: null }; // matches nothing
  return { $or: or };
}

function hasRole(actor, role) {
  return (actor.roles || []).includes(role);
}

module.exports = { recordScopeFilter, hasRole };

