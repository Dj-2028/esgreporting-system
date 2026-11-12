'use strict';

const express = require('express');
const { dbStatus } = require('../config/db');

const router = express.Router();

/** GET /health (public) → { status: "ok", db: "up" } (backend.md §7.14). */
router.get('/', (req, res) => {
  const db = dbStatus();
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'ok' : 'degraded', db });
});

module.exports = router;

