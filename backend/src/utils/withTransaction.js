'use strict';

const mongoose = require('mongoose');

/**
 * Runs `fn(session)` inside a MongoDB transaction (replica set required).
 * Retries transient errors via `session.withTransaction` and returns the
 * value produced by `fn`.
 */
module.exports = async function withTransaction(fn) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await fn(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
};

