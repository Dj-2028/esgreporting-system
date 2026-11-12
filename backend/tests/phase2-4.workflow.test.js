'use strict';

const request = require('supertest');
const { setupTestApp, clearDatabase, teardown } = require('./helpers');
const { seedReferenceData } = require('../src/seed/seedData');
const { Approval, AuditLog, Kpi } = require('../src/models');
const notification = require('../src/services/notification.service');
const { runReminders } = require('../src/jobs/reminders.job');

let app;
let tokens;
let users;
let kpis;

const PDF = (text = 'bill') => Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n`);

async function login(email) {
  const res = await request(app).post('/api/v1/auth/login').send({ email, password: 'DemoPass123' });
  expect(res.status).toBe(200);
  return res.body.data;
}

const as = (who) => ({ Authorization: `Bearer ${tokens[who]}` });

async function openPeriod(name = 'FY2026 Q1', extra = {}) {
  const p = await request(app)
    .post('/api/v1/periods')
    .set(as('admin'))
    .send({ period_name: name, period_start_date: '2026-01-01', period_end_date: '2026-03-31', ...extra });
  expect(p.status).toBe(201);
  const gen = await request(app)
    .post(`/api/v1/periods/${p.body.data._id}/records`)
    .set(as('admin'))
    .send({
      assignments: [
        { kpi_id: kpis['ENV-01'], data_owner_user_id: users.ravi, approver_user_id: users.meera },
        { kpi_id: kpis['ENV-04'], data_owner_user_id: users.ravi, approver_user_id: users.meera },
      ],
    });
  expect(gen.status).toBe(201);
  const recs = await request(app)
    .get(`/api/v1/records?reporting_period_id=${p.body.data._id}`)
    .set(as('admin'));
  const byCode = Object.fromEntries(recs.body.data.map((r) => [r.kpi.kpi_code, r]));
  return { periodId: p.body.data._id, env01: byCode['ENV-01'], env04: byCode['ENV-04'] };
}

async function getRecord(id, who = 'ravi') {
  const res = await request(app).get(`/api/v1/records/${id}`).set(as(who));
  expect(res.status).toBe(200);
  return res.body.data;
}

async function enterValue(id, value) {
  const rec = await getRecord(id);
  return request(app).patch(`/api/v1/records/${id}`).set(as('ravi')).send({ actual_value: value, updated_at: rec.updated_at });
}

async function uploadPdf(id, name = 'bill.pdf', text = 'bill') {
  return request(app).post(`/api/v1/records/${id}/evidence`).set(as('ravi')).attach('file', PDF(text), name);
}

beforeAll(async () => {
  app = await setupTestApp();
});

beforeEach(async () => {
  await clearDatabase();
  notification.clearTestOutbox();
  const seeded = await seedReferenceData({ includeDemo: true });
  const s = await Promise.all(['admin@demo.esg', 'ravi@demo.esg', 'meera@demo.esg', 'vikram@demo.esg'].map(login));
  tokens = { admin: s[0].access_token, ravi: s[1].access_token, meera: s[2].access_token, vikram: s[3].access_token };
  users = { admin: s[0].user.id, ravi: s[1].user.id, meera: s[2].user.id, vikram: s[3].user.id };
  const kpiDocs = await Kpi.find({ organization_id: seeded.demo.organization._id }).lean();
  kpis = Object.fromEntries(kpiDocs.map((k) => [k.kpi_code, String(k._id)]));
});

afterAll(teardown);

describe('Workflow acceptance scenarios (workflow.md §12)', () => {
  test('Scenario 2: assigning owner = approver is refused', async () => {
    const p = await request(app)
      .post('/api/v1/periods')
      .set(as('admin'))
      .send({ period_name: 'P', period_start_date: '2026-01-01', period_end_date: '2026-03-31' });
    const res = await request(app)
      .post(`/api/v1/periods/${p.body.data._id}/records`)
      .set(as('admin'))
      .send({ assignments: [{ kpi_id: kpis['ENV-01'], data_owner_user_id: users.admin, approver_user_id: users.admin }] });
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('OWNER_EQUALS_APPROVER');
  });

  test('BR-7: generating a second record for the same KPI in a period is refused', async () => {
    const { periodId } = await openPeriod();
    const res = await request(app)
      .post(`/api/v1/periods/${periodId}/records`)
      .set(as('admin'))
      .send({ assignments: [{ kpi_id: kpis['ENV-01'], data_owner_user_id: users.ravi, approver_user_id: users.meera }] });
    expect(res.status).toBe(409);
    expect(res.body.error.code).toBe('DUPLICATE');
  });

  test('Scenario 3: submit without value / evidence is refused', async () => {
    const { env01 } = await openPeriod();
    let res = await request(app).post(`/api/v1/records/${env01.id}/submit`).set(as('ravi'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('VALUE_REQUIRED');

    expect((await enterValue(env01.id, 10000)).status).toBe(200);
    res = await request(app).post(`/api/v1/records/${env01.id}/submit`).set(as('ravi'));
    expect(res.status).toBe(422);
    expect(res.body.error.code).toBe('EVIDENCE_REQUIRED');
  });

  test("Scenario 4: a user cannot submit someone else's record", async () => {
    const { env01 } = await openPeriod();
    // Admin is not the owner → 403 even though Admin can see the record
    const res = await request(app).post(`/api/v1/records/${env01.id}/submit`).set(as('admin'));
    expect(res.status).toBe(403);
  });

  test('Scenarios 5 & 6: reject needs a remark; nobody approves their own record', async () => {
    const { periodId } = await openPeriod();
    // Admin owns ENV-02, Meera approves it
    await request(app)
      .post(`/api/v1/periods/${periodId}/records`)
      .set(as('admin'))
      .send({ assignments: [{ kpi_id: kpis['ENV-02'], data_owner_user_id: users.admin, approver_user_id: users.meera }] });
    const list = await request(app).get(`/api/v1/records?reporting_period_id=${periodId}&q=ENV-02`).set(as('admin'));
    const rec = list.body.data[0];
    const detail = await getRecord(rec.id, 'admin');
    await request(app).patch(`/api/v1/records/${rec.id}`).set(as('admin')).send({ actual_value: 5, updated_at: detail.updated_at });
    await request(app).post(`/api/v1/records/${rec.id}/evidence`).set(as('admin')).attach('file', PDF('s2'), 's2.pdf');
    expect((await request(app).post(`/api/v1/records/${rec.id}/submit`).set(as('admin'))).status).toBe(200);

    const own = await request(app).post(`/api/v1/records/${rec.id}/approve`).set(as('admin')).send({});
    expect(own.status).toBe(403);
    expect(own.body.error.code).toBe('SEGREGATION_OF_DUTIES');

    const noRemark = await request(app).post(`/api/v1/records/${rec.id}/reject`).set(as('meera')).send({ comments: 'no' });
    expect(noRemark.status).toBe(422);
    expect(noRemark.body.error.code).toBe('REMARK_REQUIRED');
  });

  test('Scenarios 7, 8, 14 + worked example: reject → fix → approve, locked, reopen needs reason', async () => {
    const { env01 } = await openPeriod();

    // Ravi enters 10,000 kWh, uploads the bill, submits
    expect((await enterValue(env01.id, 10000)).status).toBe(200);
    expect((await uploadPdf(env01.id, 'electricity-bill-jan.pdf')).status).toBe(201);
    expect((await request(app).post(`/api/v1/records/${env01.id}/submit`).set(as('ravi'))).status).toBe(200);

    // Meera rejects with a remark
    const rej = await request(app)
      .post(`/api/v1/records/${env01.id}/reject`)
      .set(as('meera'))
      .send({ comments: 'Bill total is 12,400 kWh; please correct.' });
    expect(rej.status).toBe(200);
    expect(rej.body.data.submission_status).toBe('Rejected');

    // Ravi corrects and resubmits; Meera approves
    expect((await enterValue(env01.id, 12400)).status).toBe(200);
    expect((await request(app).post(`/api/v1/records/${env01.id}/submit`).set(as('ravi'))).status).toBe(200);
    const appr = await request(app).post(`/api/v1/records/${env01.id}/approve`).set(as('meera')).send({});
    expect(appr.status).toBe(200);
    expect(appr.body.data.submission_status).toBe('Approved');

    // Scenario 14: two approval rows, audit shows the full path
    const approvals = await Approval.find({ kpi_record_id: env01.id }).sort({ reviewed_at: 1 }).lean();
    expect(approvals.map((a) => a.approval_status)).toEqual(['Rejected', 'Approved']);
    const actions = (await AuditLog.find({ record_id: env01.id }).sort({ created_at: 1, _id: 1 }).lean()).map((a) => a.action_name);
    expect(actions).toEqual(['CREATE', 'UPDATE', 'SUBMIT', 'REJECT', 'UPDATE', 'SUBMIT', 'APPROVE']);

    // Scenario 7: editing an approved record is locked
    const locked = await enterValue(env01.id, 1);
    expect(locked.status).toBe(409);
    expect(locked.body.error.code).toBe('RECORD_LOCKED');

    // Double click on approve → INVALID_TRANSITION
    const again = await request(app).post(`/api/v1/records/${env01.id}/approve`).set(as('meera')).send({});
    expect(again.status).toBe(409);
    expect(again.body.error.code).toBe('INVALID_TRANSITION');

    // Scenario 8: reopen requires a reason
    const noReason = await request(app).post(`/api/v1/records/${env01.id}/reopen`).set(as('admin')).send({});
    expect(noReason.status).toBe(422);
    expect(noReason.body.error.code).toBe('REASON_REQUIRED');
    const reopened = await request(app)
      .post(`/api/v1/records/${env01.id}/reopen`)
      .set(as('admin'))
      .send({ reason: 'Utility issued a corrected bill' });
    expect(reopened.status).toBe(200);
    expect(reopened.body.data.submission_status).toBe('In Progress');

    // Emails went to approver (submit), owner (reject/approve), both (reopen)
    const subjects = notification.getTestOutbox().map((m) => m.subject);
    expect(subjects.some((s) => s.startsWith('[ESG] Rejected'))).toBe(true);
    expect(subjects.some((s) => s.startsWith('[ESG] Approved'))).toBe(true);
  });

  test('Optimistic concurrency: stale updated_at → STALE_RECORD; % KPI limited to 0–100', async () => {
    const { env01, env04 } = await openPeriod();
    const rec = await getRecord(env01.id);
    expect((await request(app).patch(`/api/v1/records/${env01.id}`).set(as('ravi')).send({ actual_value: 1, updated_at: rec.updated_at })).status).toBe(200);
    const stale = await request(app).patch(`/api/v1/records/${env01.id}`).set(as('ravi')).send({ actual_value: 2, updated_at: rec.updated_at });
    expect(stale.status).toBe(409);
    expect(stale.body.error.code).toBe('STALE_RECORD');

    const pct = await enterValue(env04.id, 120);
    expect(pct.status).toBe(400);
    expect(pct.body.error.code).toBe('VALIDATION_ERROR');
    const dec = await enterValue(env04.id, 1.1234567);
    expect(dec.status).toBe(400);
  });

  test('Scenario 9: closing with open records is blocked; force requires reason; closed period is read-only', async () => {
    const { periodId, env01 } = await openPeriod();
    const blocked = await request(app).post(`/api/v1/periods/${periodId}/close`).set(as('admin')).send({});
    expect(blocked.status).toBe(409);
    expect(blocked.body.error.code).toBe('OPEN_RECORDS_EXIST');
    expect(blocked.body.error.details).toHaveLength(2);

    const noReason = await request(app).post(`/api/v1/periods/${periodId}/close`).set(as('admin')).send({ force: true });
    expect(noReason.status).toBe(422);

    const forced = await request(app)
      .post(`/api/v1/periods/${periodId}/close`)
      .set(as('admin'))
      .send({ force: true, reason: 'Year-end deadline reached' });
    expect(forced.status).toBe(200);
    expect(forced.body.data.period_status).toBe('Closed');

    const write = await enterValue(env01.id, 5);
    expect(write.status).toBe(409);
    expect(write.body.error.code).toBe('PERIOD_CLOSED');
  });

  test('Scenario 10: Viewer cannot POST', async () => {
    const res = await request(app)
      .post('/api/v1/periods')
      .set(as('vikram'))
      .send({ period_name: 'X', period_start_date: '2026-01-01', period_end_date: '2026-02-01' });
    expect(res.status).toBe(403);
    const kpi = await request(app).post('/api/v1/kpis').set(as('vikram')).send({});
    expect(kpi.status).toBe(403);
  });

  test("Scenario 11: another organisation's record by ID → 404", async () => {
    const { env01 } = await openPeriod();
    await request(app).post('/api/v1/auth/register-organization').send({
      organization_name: 'Rival Inc',
      organization_code: 'RIVAL',
      display_name: 'Rita',
      email: 'rita@rival.test',
      password: 'RivalPass123',
    });
    const l = await request(app).post('/api/v1/auth/login').send({ email: 'rita@rival.test', password: 'RivalPass123' });
    const res = await request(app).get(`/api/v1/records/${env01.id}`).set('Authorization', `Bearer ${l.body.data.access_token}`);
    expect(res.status).toBe(404);
    const ev = await request(app).post(`/api/v1/records/${env01.id}/submit`).set('Authorization', `Bearer ${l.body.data.access_token}`);
    expect(ev.status).toBe(404); // Foreign org ID yields 404 (backend.md §5.3)
  });

  test('Scenario 12: .exe → 415, 11 MB → 413, duplicate hash → 409; download is authenticated', async () => {
    const { env01 } = await openPeriod();
    const exe = await request(app)
      .post(`/api/v1/records/${env01.id}/evidence`)
      .set(as('ravi'))
      .attach('file', Buffer.concat([Buffer.from('MZ'), Buffer.alloc(200, 1)]), 'tool.exe');
    expect(exe.status).toBe(415);
    expect(exe.body.error.code).toBe('UNSUPPORTED_FILE_TYPE');

    const big = await request(app)
      .post(`/api/v1/records/${env01.id}/evidence`)
      .set(as('ravi'))
      .attach('file', Buffer.concat([PDF(), Buffer.alloc(11 * 1024 * 1024)]), 'big.pdf');
    expect(big.status).toBe(413);
    expect(big.body.error.code).toBe('FILE_TOO_LARGE');

    const ok = await uploadPdf(env01.id, 'a.pdf', 'same');
    expect(ok.status).toBe(201);
    const dup = await uploadPdf(env01.id, 'b.pdf', 'same');
    expect(dup.status).toBe(409);
    expect(dup.body.error.code).toBe('DUPLICATE');

    const csv = await request(app)
      .post(`/api/v1/records/${env01.id}/evidence`)
      .set(as('ravi'))
      .attach('file', Buffer.from('meter,kwh\nA,100\n'), { filename: 'readings.csv', contentType: 'text/csv' });
    expect(csv.status).toBe(201);

    const anon = await request(app).get(`/api/v1/evidence/${ok.body.data.id}/download`);
    expect(anon.status).toBe(401);
    const dl = await request(app).get(`/api/v1/evidence/${ok.body.data.id}/download?inline=1`).set(as('meera'));
    expect(dl.status).toBe(200);
    expect(dl.headers['content-type']).toBe('application/pdf');
    expect(dl.headers['content-disposition']).toMatch(/^inline/);

    const del = await request(app).delete(`/api/v1/evidence/${ok.body.data.id}`).set(as('ravi'));
    expect(del.status).toBe(204);
  });

  test('Scenario 13 + content index: exports and content index contain approved data only, gaps flagged', async () => {
    const { periodId, env01, env04 } = await openPeriod();
    await enterValue(env01.id, 12400);
    await uploadPdf(env01.id);
    await request(app).post(`/api/v1/records/${env01.id}/submit`).set(as('ravi'));
    await request(app).post(`/api/v1/records/${env01.id}/approve`).set(as('meera')).send({});
    await enterValue(env04.id, 40); // not approved

    const csv = await request(app).get(`/api/v1/reports/export?reporting_period_id=${periodId}&format=csv`).set(as('vikram'));
    expect(csv.status).toBe(200);
    expect(csv.headers['x-row-count']).toBe('1');
    expect(csv.text).toContain('ENV-01');
    expect(csv.text).not.toContain('ENV-04');

    // include_all is ignored for Viewer, honoured for Admin
    const viewerAll = await request(app).get(`/api/v1/reports/export?reporting_period_id=${periodId}&format=csv&include_all=true`).set(as('vikram'));
    expect(viewerAll.headers['x-row-count']).toBe('1');
    const adminAll = await request(app).get(`/api/v1/reports/export?reporting_period_id=${periodId}&format=xlsx&include_all=true`).set(as('admin'));
    expect(adminAll.status).toBe(200);
    expect(adminAll.headers['x-row-count']).toBe('2');
    const pdf = await request(app).get(`/api/v1/reports/export?reporting_period_id=${periodId}&format=pdf`).set(as('admin'));
    expect(pdf.status).toBe(200);
    expect(pdf.headers['content-type']).toBe('application/pdf');

    const idx = await request(app).get(`/api/v1/reports/content-index?reporting_period_id=${periodId}`).set(as('vikram'));
    expect(idx.status).toBe(200);
    const byCode = Object.fromEntries(idx.body.data.rows.map((r) => [r.disclosure_code, r]));
    expect(byCode['GRI 302-1'].status).toBe('Approved');
    expect(byCode['GRI 302-1'].kpis[0].actual_value).toBe(12400);
    expect(byCode['GRI 306-4'].gap).toBe(true);
    expect(byCode['GRI 306-4'].kpis[0].actual_value).toBeNull();
    expect(byCode['GRI 2-9'].gap_severity).toBe('mandatory');

    const exportsLogged = await AuditLog.countDocuments({ action_name: 'EXPORT' });
    expect(exportsLogged).toBe(4);

    // Data Owner cannot see reports
    const dOwner = await request(app).get(`/api/v1/reports/content-index?reporting_period_id=${periodId}`).set(as('ravi'));
    expect(dOwner.status).toBe(403);
  });

  test('Dashboard is scoped; audit log filters; emissions calc; reminders', async () => {
    const { periodId, env01 } = await openPeriod('FY2026 Q1');
    const adminDash = await request(app).get(`/api/v1/dashboard?reporting_period_id=${periodId}`).set(as('admin'));
    expect(adminDash.status).toBe(200);
    expect(adminDash.body.data.totals.total).toBe(2);
    expect(adminDash.body.data.scope).toBe('organization');
    expect(adminDash.body.data.by_pillar[0].pillar_code).toBe('E');

    const viewerDash = await request(app).get('/api/v1/dashboard').set(as('vikram'));
    expect(viewerDash.body.data.totals.total).toBe(2);

    // Records list scoping: Meera sees her approvals
    const mine = await request(app).get(`/api/v1/records?reporting_period_id=${periodId}&scope=my_approvals`).set(as('meera'));
    expect(mine.body.data).toHaveLength(2);

    const logs = await request(app).get('/api/v1/audit-logs?action_name=CREATE&entity_name=kpi_record').set(as('vikram'));
    expect(logs.status).toBe(200);
    expect(logs.body.meta.total).toBe(2);

    const hist = await request(app).get(`/api/v1/records/${env01.id}/history`).set(as('ravi'));
    expect(hist.status).toBe(200);

    const calc = await request(app)
      .post('/api/v1/tools/emissions-calc')
      .set(as('ravi'))
      .send({ scope: 2, activity_data: 10000, activity_unit: 'kWh', emission_factor_kg_per_unit: 0.4 });
    expect(calc.status).toBe(200);
    expect(calc.body.data.emissions_kg).toBe(4000);
    expect(calc.body.data.emissions_tco2e).toBe(4);

    // Reminder 7 days before 2026-03-31
    notification.clearTestOutbox();
    const sent = await runReminders(new Date('2026-03-24T08:00:00Z'));
    expect(sent).toBe(1); // Ravi (owner of both records)
    expect(notification.getTestOutbox()[0].subject).toMatch(/7 days left/);
    expect(await runReminders(new Date('2026-03-20T08:00:00Z'))).toBe(0);
  });

  test('Copy from previous period prefills owner/approver/target; reassignment validated', async () => {
    const { periodId, env01 } = await openPeriod('FY2025');
    const detail = await getRecord(env01.id);
    await request(app).patch(`/api/v1/records/${env01.id}`).set(as('ravi')).send({ target_value: 9000, updated_at: detail.updated_at });

    const p2 = await request(app)
      .post('/api/v1/periods')
      .set(as('admin'))
      .send({ period_name: 'FY2026', period_start_date: '2026-04-01', period_end_date: '2027-03-31' });
    const gen = await request(app)
      .post(`/api/v1/periods/${p2.body.data._id}/records`)
      .set(as('admin'))
      .send({ assignments: [{ kpi_id: kpis['ENV-01'] }], copy_from_period_id: periodId });
    expect(gen.status).toBe(201);
    const rec = gen.body.data.records[0];
    expect(String(rec.data_owner_user_id)).toBe(users.ravi);
    expect(rec.target_value).toBe(9000);

    const bad = await request(app)
      .patch(`/api/v1/records/${rec._id}/assignment`)
      .set(as('admin'))
      .send({ approver_user_id: users.ravi });
    expect(bad.status).toBe(422);
    expect(bad.body.error.code).toBe('OWNER_EQUALS_APPROVER');
    const viewerAsOwner = await request(app)
      .patch(`/api/v1/records/${rec._id}/assignment`)
      .set(as('admin'))
      .send({ data_owner_user_id: users.vikram });
    expect(viewerAsOwner.status).toBe(422);
  });
});

