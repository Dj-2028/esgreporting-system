'use strict';

const multer = require('multer');
const env = require('../config/env');

/** Single evidence file in memory (hashed before storing) — backend.md §8.5. */
const uploadSingleEvidence = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: env.MAX_FILE_MB * 1024 * 1024, files: 1 },
}).single('file');

module.exports = { uploadSingleEvidence };

