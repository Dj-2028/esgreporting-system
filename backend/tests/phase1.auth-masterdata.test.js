'use strict';

const request = require('supertest');
const { setupTestApp, clearDatabase, teardown } = require('./helpers');
const { seedReferenceData } = require('../src/seed/seedData');
const { AuditLog } = require('../src/models');
const notification = require('../src/services/notification.service');

let app;

beforeAll(async () => {
  app = await setupTestApp();
});

beforeEach(async () => {
  await clearDatabase();
  notification.clearTestOutbox();
  await seedReferenceData({ includeDemo: false });
});

afterAll(teardown);

async function registerAndLogin(overrides = {}) {
  const payload = {
    organization_name: overrides.organization_name || 'Acme Corp',
    organization_code: overrides.organization_code || 'ACME',
    display_name: overrides.display_name || 'Alice Admin',
    email: overrides.email || 'alice@acme.test',
    password: overrides.password || 'SecurePass123',
  };
  const reg = await request(app).post('/api/v1/auth/register-organization').send(payload);
  expect(reg.status).toBe(201);

  const loginRes = await request(app)
    .post('/api/v1/auth/login')
    .send({ email: payload.email, password: payload.password });
  expect(loginRes.status).toBe(200);

  return {
    org: reg.body.data.organization,
    user: loginRes.body.data.user,
    token: loginRes.body.data.access_token,
    cookies: loginRes.headers['set-cookie'],
  };
}

describe('Phase 1 — Auth, RBAC, Master Data, Audit Immutability', () => {
  test('Scenario 1: Register organisation is atomic and creates org, Admin user, role, and audit rows', async () => {
    const { org, user, token } = await registerAndLogin();
    expect(org.organization_code).toBe('ACME');
    expect(user.roles).toContain('Admin');

    const meRes = await request(app)
      .get('/api/v1/auth/me')
      .set('Authorization', `Bearer ${token}`);
    expect(meRes.status).toBe(200);
    expect(meRes.body.data.email).toBe('alice@acme.test');

    const logs = await AuditLog.find({ organization_id: org._id }).lean();
    expect(logs.length).toBeGreaterThanOrEqual(4); // org CREATE, user CREATE, role ASSIGN_ROLE, LOGIN

    // Duplicate org code rejected
    const dup = await request(app).post('/api/v1/auth/register-organization').send({
      organization_name: 'Another Name',
      organization_code: 'ACME',
      display_name: 'Bob',
      email: 'bob@acme.test',
      password: 'SecurePass123',
    });
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');
  });

  test('Audit log is append-only and blocks updates and deletes', async () => {
    await registerAndLogin();
    const row = await AuditLog.findOne();
    await expect(
      AuditLog.updateOne({ _id: row._id }, { $set: { action_name: 'UPDATE' } }),
    ).rejects.toThrow(/append-only/);
    await expect(AuditLog.deleteOne({ _id: row._id })).rejects.toThrow(/append-only/);
  });

  test('Refresh token rotation, reuse detection, change-password, and password reset', async () => {
    const { token, cookies } = await registerAndLogin();

    // Rotate refresh token
    const ref1 = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);
    expect(ref1.status).toBe(200);
    expect(ref1.body.data.access_token).toBeDefined();
    const rotatedCookies = ref1.headers['set-cookie'];

    // Reusing the old refresh cookie revokes the family
    const reuse = await request(app).post('/api/v1/auth/refresh').set('Cookie', cookies);
    expect(reuse.status).toBe(401);

    const afterReuse = await request(app)
      .post('/api/v1/auth/refresh')
      .set('Cookie', rotatedCookies);
    expect(afterReuse.status).toBe(401);

    // Change password
    const chg = await request(app)
      .post('/api/v1/auth/change-password')
      .set('Authorization', `Bearer ${token}`)
      .send({ current_password: 'SecurePass123', new_password: 'NewPassword456' });
    expect(chg.status).toBe(204);

    // Forgot + reset password
    notification.clearTestOutbox();
    const forgot = await request(app)
      .post('/api/v1/auth/forgot-password')
      .send({ email: 'alice@acme.test' });
    expect(forgot.status).toBe(200);
    const outbox = notification.getTestOutbox();
    expect(outbox).toHaveLength(1);
    const match = /token=([A-Za-z0-9_-]+)/.exec(outbox[0].text);
    expect(match).not.toBeNull();

    const reset = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: match[1], new_password: 'ResetPass789' });
    expect(reset.status).toBe(204);

    // Single-use token cannot be used again
    const resetAgain = await request(app)
      .post('/api/v1/auth/reset-password')
      .send({ token: match[1], new_password: 'ResetPass789' });
    expect(resetAgain.status).toBe(400);
  });

  test('Departments, Users, Roles, last-Admin protection, and deactivation reassignment', async () => {
    const { token, user: adminUser } = await registerAndLogin();
    const auth = { Authorization: `Bearer ${token}` };

    // Create 2 departments
    const d1 = await request(app)
      .post('/api/v1/departments')
      .set(auth)
      .send({ department_name: 'Operations', department_code: 'OPS' });
    expect(d1.status).toBe(201);

    const d2 = await request(app)
      .post('/api/v1/departments')
      .set(auth)
      .send({ department_name: 'Finance', department_code: 'FIN' });
    expect(d2.status).toBe(201);

    // Fetch roles
    const rolesRes = await request(app).get('/api/v1/roles').set(auth);
    const roleByName = Object.fromEntries(
      rolesRes.body.data.map((r) => [r.role_name, r._id]),
    );

    // Create Data Owner user in OPS department
    const uRes = await request(app)
      .post('/api/v1/users')
      .set(auth)
      .send({
        email: 'owner@acme.test',
        display_name: 'Owen Owner',
        department_id: d1.body.data._id,
        role_ids: [roleByName['Data Owner']],
      });
    expect(uRes.status).toBe(201);
    expect(uRes.body.data.must_change_password).toBe(true);
    expect(uRes.body.data.roles).toEqual(['Data Owner']);

    // Deactivating OPS without reassignment fails with 409 IN_USE
    const deactFail = await request(app)
      .patch(`/api/v1/departments/${d1.body.data._id}`)
      .set(auth)
      .send({ is_active: false });
    expect(deactFail.status).toBe(409);
    expect(deactFail.body.error.code).toBe('IN_USE');

    // Deactivating OPS with reassign_to_department_id moves user and succeeds
    const deactOk = await request(app)
      .patch(`/api/v1/departments/${d1.body.data._id}`)
      .set(auth)
      .send({ is_active: false, reassign_to_department_id: d2.body.data._id });
    expect(deactOk.status).toBe(200);
    expect(deactOk.body.data.is_active).toBe(false);

    // Last active Admin cannot be deactivated
    const selfDeact = await request(app)
      .patch(`/api/v1/users/${adminUser.id}`)
      .set(auth)
      .send({ is_active: false });
    expect(selfDeact.status).toBe(409);
    expect(selfDeact.body.error.code).toBe('IN_USE');
  });

  test('Standards, Disclosures, KPIs, IN_USE guard, and cross-org isolation (404)', async () => {
    // Platform admin (email matches PLATFORM_ADMIN_EMAILS in setupEnv.js)
    const plat = await registerAndLogin({
      organization_name: 'Platform Org',
      organization_code: 'PLAT',
      email: 'platform@esg.test',
    });
    const platAuth = { Authorization: `Bearer ${plat.token}` };

    // Second org (regular Admin)
    const other = await registerAndLogin({
      organization_name: 'Other Org',
      organization_code: 'OTHR',
      email: 'admin@other.test',
    });
    const otherAuth = { Authorization: `Bearer ${other.token}` };

    // Regular org Admin cannot create global standards
    const stdForbidden = await request(app).post('/api/v1/standards').set(otherAuth).send({
      standard_code: 'BRSR',
      standard_name: 'BRSR',
      version_label: '2023',
    });
    expect(stdForbidden.status).toBe(403);

    // Platform Admin creates a disclosure on GRI
    const stds = await request(app).get('/api/v1/standards').set(platAuth);
    const gri = stds.body.data.find((s) => s.standard_code === 'GRI');
    const discRes = await request(app)
      .post(`/api/v1/standards/${gri._id}/disclosures`)
      .set(platAuth)
      .send({
        disclosure_code: 'GRI 999-1',
        disclosure_title: 'Custom test disclosure',
        is_mandatory: false,
      });
    expect(discRes.status).toBe(201);
    const discId = discRes.body.data._id;

    // Create KPI mapped to GRI 999-1
    const pillars = await request(app).get('/api/v1/pillars').set(platAuth);
    const envPillar = pillars.body.data.find((p) => p.pillar_code === 'E');

    const kpiRes = await request(app)
      .post('/api/v1/kpis')
      .set(platAuth)
      .send({
        esg_pillar_id: envPillar._id,
        kpi_code: 'ENV-99',
        kpi_name: 'Custom Energy KPI',
        unit_of_measurement: 'kWh',
        frequency: 'Quarterly',
        standard_disclosure_ids: [discId],
      });
    expect(kpiRes.status).toBe(201);
    expect(kpiRes.body.data.disclosures).toHaveLength(1);

    // Deleting a mapped disclosure returns 409 IN_USE
    const delInUse = await request(app)
      .delete(`/api/v1/disclosures/${discId}`)
      .set(platAuth);
    expect(delInUse.status).toBe(409);
    expect(delInUse.body.error.code).toBe('IN_USE');

    // Scenario 11: Accessing another organisation's KPI by ID returns 404 (not 403)
    const foreignGet = await request(app)
      .get(`/api/v1/kpis/${kpiRes.body.data._id}`)
      .set(otherAuth);
    expect(foreignGet.status).toBe(404);
  });
});

