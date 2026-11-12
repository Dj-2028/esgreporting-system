'use strict';

const fs = require('fs');
const path = require('path');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

(async () => {
  const dbPath = path.resolve(__dirname, '..', '.devdb');
  fs.mkdirSync(dbPath, { recursive: true });

  // eslint-disable-next-line no-console
  console.log('Starting local MongoDB replica set (rs0)…');
  const replSet = await MongoMemoryReplSet.create({
    replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ dbPath }],
  });

  const uri = replSet.getUri('esg');
  process.env.MONGODB_URI = uri;
  // eslint-disable-next-line no-console
  console.log(`MongoDB replica set ready at ${uri}`);

  const env = require('../src/config/env');
  const logger = require('../src/utils/logger');
  const { connectDB, disconnectDB } = require('../src/config/db');
  const { createApp } = require('../src/app');
  const { seedReferenceData } = require('../src/seed/seedData');
  const { startReminderJob } = require('../src/jobs/reminders.job');
  const { ReportingPeriod, Kpi, KpiRecord } = require('../src/models');
  const { ROLES, RECORD_STATUS, PERIOD_STATUS } = require('../src/config/constants');

  await connectDB(uri);

  const seeded = await seedReferenceData({ includeDemo: true });

  // Create a sample reporting period and KPI records in DEMO if none exist yet
  if (seeded.demo) {
    const demoOrg = seeded.demo.organization;
    const ravi = seeded.demo.users[ROLES.DATA_OWNER];
    const meera = seeded.demo.users[ROLES.APPROVER];

    let period = await ReportingPeriod.findOne({
      organization_id: demoOrg._id,
      period_name: 'FY2026 Q1',
    });
    if (!period) {
      period = await ReportingPeriod.create({
        organization_id: demoOrg._id,
        period_name: 'FY2026 Q1',
        period_start_date: new Date('2026-01-01'),
        period_end_date: new Date('2026-12-31'),
        period_status: PERIOD_STATUS.IN_PROGRESS,
      });
    }

    const existingRecords = await KpiRecord.countDocuments({
      reporting_period_id: period._id,
    });
    if (existingRecords === 0 && ravi && meera) {
      const kpis = await Kpi.find({ organization_id: demoOrg._id, is_active: true }).lean();
      await KpiRecord.insertMany(
        kpis.map((k) => ({
          organization_id: demoOrg._id,
          kpi_id: k._id,
          reporting_period_id: period._id,
          data_owner_user_id: ravi._id,
          approver_user_id: meera._id,
          submission_status: RECORD_STATUS.IN_PROGRESS,
        })),
      );
    }
  }

  const app = createApp();
  const reminderTask = startReminderJob();

  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT }, `ESG Backend API running at http://localhost:${env.PORT}`);
    // eslint-disable-next-line no-console
    console.log(`\n========================================================`);
    // eslint-disable-next-line no-console
    console.log(`ESG Backend API:  http://localhost:${env.PORT}/api/v1/health`);
    // eslint-disable-next-line no-console
    console.log(`Swagger API Docs: http://localhost:${env.PORT}/api/docs`);
    // eslint-disable-next-line no-console
    console.log(`Demo Logins (Password: DemoPass123):`);
    // eslint-disable-next-line no-console
    console.log(`  Admin:      admin@demo.esg`);
    // eslint-disable-next-line no-console
    console.log(`  Data Owner: ravi@demo.esg`);
    // eslint-disable-next-line no-console
    console.log(`  Approver:   meera@demo.esg`);
    // eslint-disable-next-line no-console
    console.log(`  Viewer:     vikram@demo.esg`);
    // eslint-disable-next-line no-console
    console.log(`========================================================\n`);
  });

  const shutdown = async () => {
    if (reminderTask) reminderTask.stop();
    server.close();
    await disconnectDB();
    await replSet.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Failed to start local stack:', err);
  process.exit(1);
});

