export const ROLES = {
  ADMIN: 'Admin',
  DATA_OWNER: 'Data Owner',
  APPROVER: 'Approver',
  VIEWER: 'Viewer',
};

export const RECORD_STATUS = {
  IN_PROGRESS: 'In Progress',
  READY_FOR_APPROVAL: 'Ready for Approval',
  APPROVED: 'Approved',
  REJECTED: 'Rejected',
};

export const PERIOD_STATUS = {
  IN_PROGRESS: 'In Progress',
  CLOSED: 'Closed',
};

export const KPI_UNITS = ['kWh', '%', 'tCO2e', 'm³', 't', 'hours', 'count', 'rate'];
export const KPI_FREQUENCIES = ['Monthly', 'Quarterly', 'Annual'];

export const AUDIT_ACTIONS = [
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
];

