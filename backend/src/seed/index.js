'use strict';

const env = require('../config/env');
const { connectDB, disconnectDB } = require('../config/db');
const logger = require('../utils/logger');
const { seedReferenceData } = require('./seedData');

(async () => {
  await connectDB();
  const includeDemo = env.NODE_ENV !== 'production';
  await seedReferenceData({ includeDemo });
  logger.info({ includeDemo }, 'Seed completed');
  await disconnectDB();
})().catch((err) => {
  logger.error({ err }, 'Seed failed');
  process.exit(1);
});

