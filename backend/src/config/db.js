'use strict';

const mongoose = require('mongoose');
const env = require('./env');
const logger = require('../utils/logger');

mongoose.set('strictQuery', true);

async function connectDB(uri = env.MONGODB_URI) {
  await mongoose.connect(uri, {
    autoIndex: env.NODE_ENV !== 'production', // prod: `npm run indexes`
    serverSelectionTimeoutMS: 10000,
  });
  logger.info({ db: mongoose.connection.name }, 'MongoDB connected');
  return mongoose.connection;
}

async function disconnectDB() {
  await mongoose.disconnect();
}

/** 'up' when the mongoose connection is open, otherwise 'down'. */
function dbStatus() {
  return mongoose.connection.readyState === 1 ? 'up' : 'down';
}

module.exports = { connectDB, disconnectDB, dbStatus };

