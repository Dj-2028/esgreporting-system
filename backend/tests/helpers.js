'use strict';

const mongoose = require('mongoose');
const { connectDB } = require('../src/config/db');
const { createApp } = require('../src/app');

/** Connects mongoose to the test replica set and returns a fresh app. */
async function setupTestApp() {
  if (mongoose.connection.readyState !== 1) await connectDB(process.env.MONGODB_URI);
  return createApp();
}

/** Drops all collections between tests. */
async function clearDatabase() {
  const { collections } = mongoose.connection;
  await Promise.all(Object.values(collections).map((c) => c.deleteMany({})));
}

async function teardown() {
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
}

module.exports = { setupTestApp, clearDatabase, teardown };

