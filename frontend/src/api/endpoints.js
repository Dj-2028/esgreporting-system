import { apiClient } from './client.js';

const unwrap = (res) => res.data.data;
const unwrapList = (res) => res.data;

export const authApi = {
  registerOrganization: (body) => apiClient.post('/auth/register-organization', body).then(unwrap),
  login: (body) => apiClient.post('/auth/login', body).then(unwrap),
  refresh: () => apiClient.post('/auth/refresh').then(unwrap),
  logout: () => apiClient.post('/auth/logout'),
  me: () => apiClient.get('/auth/me').then(unwrap),
  changePassword: (body) => apiClient.post('/auth/change-password', body),
  forgotPassword: (body) => apiClient.post('/auth/forgot-password', body).then(unwrap),
  resetPassword: (body) => apiClient.post('/auth/reset-password', body),
};

export const masterApi = {
  getOrganization: () => apiClient.get('/organizations/current').then(unwrap),
  patchOrganization: (body) => apiClient.patch('/organizations/current', body).then(unwrap),

  listDepartments: (params) => apiClient.get('/departments', { params }).then(unwrapList),
  createDepartment: (body) => apiClient.post('/departments', body).then(unwrap),
  patchDepartment: (id, body) => apiClient.patch(`/departments/${id}`, body).then(unwrap),

  listUsers: (params) => apiClient.get('/users', { params }).then(unwrapList),
  createUser: (body) => apiClient.post('/users', body).then(unwrap),
  patchUser: (id, body) => apiClient.patch(`/users/${id}`, body).then(unwrap),
  assignRole: (userId, role_id) =>
    apiClient.post(`/users/${userId}/roles`, { role_id }).then(unwrap),
  revokeRole: (userId, userRoleId) => apiClient.delete(`/users/${userId}/roles/${userRoleId}`),
  listRoles: () => apiClient.get('/roles').then(unwrap),

  listPillars: () => apiClient.get('/pillars').then(unwrap),
  patchPillar: (id, body) => apiClient.patch(`/pillars/${id}`, body).then(unwrap),

  listStandards: (params) => apiClient.get('/standards', { params }).then(unwrap),
  createStandard: (body) => apiClient.post('/standards', body).then(unwrap),
  patchStandard: (id, body) => apiClient.patch(`/standards/${id}`, body).then(unwrap),
  putStandardPillars: (id, esg_pillar_ids) =>
    apiClient.put(`/standards/${id}/pillars`, { esg_pillar_ids }).then(unwrap),

  listDisclosures: (standardId, params) =>
    apiClient.get(`/standards/${standardId}/disclosures`, { params }).then(unwrapList),
  createDisclosure: (standardId, body) =>
    apiClient.post(`/standards/${standardId}/disclosures`, body).then(unwrap),
  patchDisclosure: (id, body) => apiClient.patch(`/disclosures/${id}`, body).then(unwrap),
  deleteDisclosure: (id) => apiClient.delete(`/disclosures/${id}`),

  listKpis: (params) => apiClient.get('/kpis', { params }).then(unwrapList),
  createKpi: (body) => apiClient.post('/kpis', body).then(unwrap),
  getKpi: (id) => apiClient.get(`/kpis/${id}`).then(unwrap),
  patchKpi: (id, body) => apiClient.patch(`/kpis/${id}`, body).then(unwrap),
  putKpiDisclosures: (id, standard_disclosure_ids) =>
    apiClient.put(`/kpis/${id}/disclosures`, { standard_disclosure_ids }).then(unwrap),
};

export const cycleApi = {
  listPeriods: (params) => apiClient.get('/periods', { params }).then(unwrapList),
  createPeriod: (body) => apiClient.post('/periods', body).then(unwrap),
  getPeriod: (id) => apiClient.get(`/periods/${id}`).then(unwrap),
  patchPeriod: (id, body) => apiClient.patch(`/periods/${id}`, body).then(unwrap),
  generateRecords: (id, body) => apiClient.post(`/periods/${id}/records`, body).then(unwrap),
  closePeriod: (id, body) => apiClient.post(`/periods/${id}/close`, body).then(unwrap),

  listRecords: (params) => apiClient.get('/records', { params }).then(unwrapList),
  getRecord: (id) => apiClient.get(`/records/${id}`).then(unwrap),
  patchRecordValues: (id, body) => apiClient.patch(`/records/${id}`, body).then(unwrap),
  reassignRecord: (id, body) => apiClient.patch(`/records/${id}/assignment`, body).then(unwrap),
  submitRecord: (id) => apiClient.post(`/records/${id}/submit`).then(unwrap),
  approveRecord: (id, body) => apiClient.post(`/records/${id}/approve`, body).then(unwrap),
  rejectRecord: (id, body) => apiClient.post(`/records/${id}/reject`, body).then(unwrap),
  reopenRecord: (id, body) => apiClient.post(`/records/${id}/reopen`, body).then(unwrap),
  listRecordApprovals: (id) => apiClient.get(`/records/${id}/approvals`).then(unwrap),
  listRecordHistory: (id) => apiClient.get(`/records/${id}/history`).then(unwrap),

  uploadEvidence: (recordId, file) => {
    const form = new FormData();
    form.append('file', file);
    return apiClient
      .post(`/records/${recordId}/evidence`, form, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      .then(unwrap);
  },
  listEvidence: (recordId) => apiClient.get(`/records/${recordId}/evidence`).then(unwrap),
  downloadEvidenceBlob: (evidenceId, inline = false) =>
    apiClient.get(`/evidence/${evidenceId}/download`, {
      params: inline ? { inline: 1 } : {},
      responseType: 'blob',
    }),
  deleteEvidence: (evidenceId) => apiClient.delete(`/evidence/${evidenceId}`),

  getDashboard: (params) => apiClient.get('/dashboard', { params }).then(unwrap),

  getPillarTotals: (params) => apiClient.get('/reports/pillar-totals', { params }).then(unwrap),
  getContentIndex: (params) => apiClient.get('/reports/content-index', { params }).then(unwrap),
  getKpiTrend: (params) => apiClient.get('/reports/kpi-trend', { params }).then(unwrap),
  exportReportBlob: (params) =>
    apiClient.get('/reports/export', { params, responseType: 'blob' }),

  listAuditLogs: (params) => apiClient.get('/audit-logs', { params }).then(unwrapList),
  calcEmissions: (body) => apiClient.post('/tools/emissions-calc', body).then(unwrap),
};

