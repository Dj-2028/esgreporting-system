'use strict';

/**
 * Starts one in-memory MongoDB replica set for the whole Jest run
 * (transactions need a replica set — backend.md §1).
 */
const { MongoMemoryReplSet } = require('mongodb-memory-server');

module.exports = async function globalSetup() {
  const replSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: 'wiredTiger' },
  });
  globalThis.__MONGO_REPLSET__ = replSet;
  process.env.TEST_MONGODB_URI = replSet.getUri();
};

