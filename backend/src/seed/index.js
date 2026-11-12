'use strict';

const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const logger = require('../utils/logger');
const { seedReferenceData } = require('./seedData');
const { ReportingPeriod, Kpi, KpiRecord } = require('../models');
const { ROLES, RECORD_STATUS, PERIOD_STATUS } = require('../config/constants');

(async () => {
  await connectDB();
  const includeDemo = process.argv.includes('--demo') || env.NODE_ENV !== 'production';
  const seeded = await seedReferenceData({ includeDemo });

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

  logger.info({ includeDemo }, 'Seed completed');
  await disconnectDB();
})().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});
