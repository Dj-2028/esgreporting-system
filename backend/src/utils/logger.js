'use strict';

const pino = require('pino');

const level = process.env.LOG_LEVEL || (process.env.NODE_ENV === 'test' ? 'silent' : 'info');

/** JSON logs to stdout; never log PII beyond user ID (backend.md §13). */
const logger = pino({
  level,
  redact: {
    paths: [
      'req.headers.authorization',
      'req.headers.cookie',
      'res.headers["set-cookie"]',
      '*.password',
      '*.password_hash',
    ],
    remove: true,
  },
});

module.exports = logger;

