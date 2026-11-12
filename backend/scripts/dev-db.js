'use strict';

/**
 * Local development database without Docker: a single-node MongoDB replica
 * set (required for transactions) persisted in ./.devdb.
 *   npm run dev:db   → prints the MONGODB_URI to use in .env
 */
const fs = require('fs');
const path = require('path');
const { MongoMemoryReplSet } = require('mongodb-memory-server');

const PORT = Number(process.env.DEV_DB_PORT || 27017);
const dbPath = path.resolve(__dirname, '..', '.devdb');

(async () => {
  fs.mkdirSync(dbPath, { recursive: true });
  const replSet = await MongoMemoryReplSet.create({
    replSet: { name: 'rs0', count: 1, storageEngine: 'wiredTiger' },
    instanceOpts: [{ port: PORT, dbPath }],
  });
  // eslint-disable-next-line no-console
  console.log(`Dev MongoDB replica set running.\nMONGODB_URI=mongodb://127.0.0.1:${PORT}/esg?replicaSet=rs0`);

  const stop = async () => {
    await replSet.stop({ doCleanup: false });
    process.exit(0);
  };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});

