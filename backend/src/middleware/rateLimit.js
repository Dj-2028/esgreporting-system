'use strict';

const rateLimit = require('express-rate-limit');
const env = require('../config/env');

const handler = (code, message) => (req, res) =>
  res.status(429).json({ success: false, error: { code, message, request_id: req.id } });

/** Global: 300 requests / minute / IP (backend.md §10). */
const globalLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: handler('RATE_LIMITED', 'Too many requests, please slow down'),
});

/** Login: 5 failed attempts / 15 minutes per IP + email (workflow.md §3). */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 5,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  keyGenerator: (req) =>
    `${rateLimit.ipKeyGenerator ? rateLimit.ipKeyGenerator(req.ip) : req.ip}|${String(
      (req.body && req.body.email) || '',
    ).toLowerCase()}`,
  handler: handler('TOO_MANY_ATTEMPTS', 'Too many failed attempts. Try again in 15 minutes'),
});

/** Public auth helpers (forgot/reset/register): 20 / 15 minutes / IP. */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => env.NODE_ENV === 'test',
  handler: handler('RATE_LIMITED', 'Too many requests, please try again later'),
});

module.exports = { globalLimiter, loginLimiter, authLimiter };

