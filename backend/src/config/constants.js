'use strict';

/** Shared enums (prd.md §4, §8; workflow.md §6, §10; backend.md §7.9). */

const ROLES = Object.freeze({
  ADMIN: 'Admin',
  DATA_OWNER: 'Data Owner',
  APPROVER: 'Approver',
  VIEWER: 'Viewer',
});

const RECORD_STATUS = Object.freeze({
  IN_PROGRESS: 'In Progress',
  READY_FOR_APPROVAL: 'Ready for Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

const PERIOD_STATUS = Object.freeze({
  IN_PROGRESS: 'In Progress',
  CLOSED: 'Closed',
});

const APPROVAL_STATUS = Object.freeze({
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
});

const KPI_FREQUENCY = Object.freeze(['Monthly', 'Quarterly', 'Annual']);

const PILLAR_CODES = Object.freeze(['E', 'S', 'G', 'GEN']);

const AUDIT_ACTIONS = Object.freeze([
  'CREATE',
  'UPDATE',
  'DEACTIVATE',
  'REACTIVATE',
  'LOGIN',
  'LOGIN_FAILED',
  'ASSIGN_ROLE',
  'REVOKE_ROLE',
  'UPLOAD_EVIDENCE',
  'REMOVE_EVIDENCE',
  'SUBMIT',
  'APPROVE',
  'REJECT',
  'REOPEN',
  'CLOSE_PERIOD',
  'EXPORT',
  'REASSIGN',
]);

const ALLOWED_EVIDENCE_MIME = Object.freeze([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
]);

const PAGINATION = Object.freeze({ DEFAULT_LIMIT: 20, MAX_LIMIT: 100 });

const SYSTEM_USER_EMAIL = 'system@esg.local';

module.exports = {
  ROLES,
  RECORD_STATUS,
  PERIOD_STATUS,
  APPROVAL_STATUS,
  KPI_FREQUENCY,
  PILLAR_CODES,
  AUDIT_ACTIONS,
  ALLOWED_EVIDENCE_MIME,
  PAGINATION,
  SYSTEM_USER_EMAIL,
};

