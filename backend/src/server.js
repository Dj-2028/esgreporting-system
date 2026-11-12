'use strict';

const env = require('./config/env');
const logger = require('./utils/logger');
const { connectDB, disconnectDB } = require('./config/db');
const { createApp } = require('./app');
const { startReminderJob } = require('./jobs/reminders.job');

async function start() {
  await connectDB();

  const app = createApp();
  const server = app.listen(env.PORT, () => {
    logger.info({ port: env.PORT, env: env.NODE_ENV }, 'ESG API listening');
  });

  const reminderTask = startReminderJob();

  const shutdown = (signal) => {
    logger.info({ signal }, 'Shutting down');
    if (reminderTask) reminderTask.stop();
    server.close(async () => {
      await disconnectDB();
      process.exit(0);
    });
    setTimeout(() => process.exit(1), 10000).unref();
  };
  process.on('SIGTERM', shutdown);
  process.on('SIGINT', shutdown);
}

start().catch((err) => {
  logger.fatal({ err }, 'Failed to start');
  process.exit(1);
});

