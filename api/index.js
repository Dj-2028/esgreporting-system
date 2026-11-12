'use strict';

const { createApp } = require('../backend/src/app');
const { connectDB, dbStatus } = require('../backend/src/config/db');

const app = createApp();
let connectionPromise = null;

module.exports = async (req, res) => {
  if (dbStatus() !== 'up') {
    if (!connectionPromise) {
      connectionPromise = connectDB().catch((err) => {
        connectionPromise = null;
        throw err;
      });
    }
    await connectionPromise;
  }
  return app(req, res);
};
