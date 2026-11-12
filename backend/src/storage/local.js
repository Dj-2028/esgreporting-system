'use strict';

const fs = require('fs');
const fsp = require('fs/promises');
const os = require('os');
const path = require('path');
const env = require('../config/env');

function resolveFullPath(key) {
  const configuredDir =
    process.env.VERCEL && env.UPLOAD_DIR === './uploads'
      ? path.join(os.tmpdir(), 'uploads')
      : env.UPLOAD_DIR;
  const baseDir = path.resolve(configuredDir);
  const full = path.resolve(baseDir, key);
  if (!full.startsWith(baseDir + path.sep)) {
    throw new Error('Invalid storage key');
  }
  return full;
}

async function put(key, buffer) {
  const full = resolveFullPath(key);
  await fsp.mkdir(path.dirname(full), { recursive: true });
  await fsp.writeFile(full, buffer);
  return key;
}

function createReadStream(key) {
  const full = resolveFullPath(key);
  if (!fs.existsSync(full)) {
    const err = new Error('Stored file not found');
    err.code = 'ENOENT';
    throw err;
  }
  return fs.createReadStream(full);
}

async function remove(key) {
  try {
    await fsp.unlink(resolveFullPath(key));
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
}

module.exports = { put, createReadStream, remove };

