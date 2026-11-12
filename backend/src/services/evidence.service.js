'use strict';

const crypto = require('crypto');
const path = require('path');
const FileType = require('file-type');
const env = require('../config/env');
const { ALLOWED_EVIDENCE_MIME } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const withTransaction = require('../utils/withTransaction');
const { sha256 } = require('../utils/hash');
const storage = require('../storage');
const audit = require('./audit.service');
const logger = require('../utils/logger');
const {
  loadOrgRecord,
  loadVisibleRecord,
  loadOpenPeriod,
  assertIsOwner,
  assertEditable,
} = require('./kpiRecord.service');
const { Evidence, KpiRecord } = require('../models');
const { recordScopeFilter } = require('./recordAccess');

/** Plain-text CSV has no magic bytes: accept only if declared CSV and looks like text. */
function looksLikeCsv(file) {
  const declared = file.mimetype === 'text/csv' || /\.csv$/i.test(file.originalname || '');
  if (!declared) return false;
  const sample = file.buffer.subarray(0, 4096);
  if (sample.includes(0)) return false; // binary
  return Buffer.from(sample.toString('utf8'), 'utf8').equals(sample) || sample.length === 0;
}

/** Detects MIME by magic bytes (file-type), never trusting the header alone. */
async function detectMime(file) {
  const detected = await FileType.fromBuffer(file.buffer);
  if (detected && ALLOWED_EVIDENCE_MIME.includes(detected.mime)) return detected.mime;
  if (!detected && looksLikeCsv(file)) return 'text/csv';
  return null;
}

function sanitizeFileName(name) {
  const base = path.basename(String(name || 'file'));
  const cleaned = base.replace(/[^\w.\- ()]/g, '_').replace(/\s+/g, ' ').trim();
  return (cleaned || 'file').slice(0, 255);
}

function mapEvidence(e) {
  return {
    id: String(e._id),
    kpi_record_id: String(e.kpi_record_id),
    file_name: e.file_name,
    mime_type: e.mime_type,
    file_size_bytes: e.file_size_bytes,
    file_hash: e.file_hash,
    uploaded_at: e.uploaded_at,
    uploaded_by_user_id: String(e.uploaded_by_user_id?._id || e.uploaded_by_user_id),
    uploaded_by: e.uploaded_by_user_id?.display_name
      ? { id: String(e.uploaded_by_user_id._id), display_name: e.uploaded_by_user_id.display_name }
      : undefined,
  };
}

/** POST /records/:id/evidence — backend.md §8.5. */
async function upload(actor, recordId, file) {
  if (!file || !file.buffer || !file.buffer.length) {
    throw ApiError.badRequest('VALIDATION_ERROR', 'Attach a file in the "file" field', [
      { field: 'file', message: 'File is required' },
    ]);
  }

  // Pre-checks outside the transaction (cheap, and avoid storing files we will refuse)
  const rec = await loadOrgRecord(actor, recordId);
  await loadOpenPeriod(rec);
  assertIsOwner(actor, rec);
  assertEditable(rec);

  const mime = await detectMime(file);
  if (!mime) {
    throw new ApiError(415, 'UNSUPPORTED_FILE_TYPE', 'Allowed types: PDF, PNG, JPG, CSV, XLSX, DOCX');
  }

  const hash = sha256(file.buffer);
  const key = `org/${actor.organization_id}/record/${rec._id}/${crypto.randomUUID()}`;
  await storage.put(key, file.buffer);

  try {
    return await withTransaction(async (session) => {
      const record = await KpiRecord.findById(rec._id).session(session);
      assertEditable(record);

      const active = await Evidence.countDocuments({ kpi_record_id: rec._id, is_active: true }).session(session);
      if (active >= env.MAX_FILES_PER_RECORD) {
        throw ApiError.unprocessable('VALIDATION_ERROR', `A record can have at most ${env.MAX_FILES_PER_RECORD} evidence files`, [
          { field: 'file', message: 'Maximum number of files reached' },
        ]);
      }
      const dup = await Evidence.findOne({ kpi_record_id: rec._id, file_hash: hash, is_active: true })
        .session(session)
        .lean();
      if (dup) {
        throw ApiError.conflict('DUPLICATE', `This file is already attached as "${dup.file_name}"`, [
          { field: 'file', message: 'Duplicate file' },
        ]);
      }

      const [ev] = await Evidence.create(
        [
          {
            kpi_record_id: rec._id,
            uploaded_by_user_id: actor._id,
            file_name: sanitizeFileName(file.originalname),
            file_url: key,
            file_hash: hash,
            mime_type: mime,
            file_size_bytes: file.size || file.buffer.length,
          },
        ],
        { session },
      );
      await audit.log({
        session,
        user_id: actor.id,
        organization_id: actor.organization_id,
        entity_name: 'evidence',
        record_id: ev._id,
        action_name: 'UPLOAD_EVIDENCE',
        updated_value: {
          kpi_record_id: rec._id,
          file_name: ev.file_name,
          file_hash: hash,
          mime_type: mime,
          file_size_bytes: ev.file_size_bytes,
        },
      });
      return mapEvidence(ev.toObject());
    });
  } catch (err) {
    // Compensate: the DB write failed, so drop the stored object
    await storage.remove(key).catch((e) => logger.warn({ err: e, key }, 'Failed to remove orphaned evidence'));
    throw err;
  }
}

async function list(actor, recordId) {
  const rec = await loadVisibleRecord(actor, recordId);
  const rows = await Evidence.find({ kpi_record_id: rec._id, is_active: true })
    .sort({ uploaded_at: -1 })
    .populate('uploaded_by_user_id', 'display_name')
    .lean();
  return rows.map(mapEvidence);
}

/** Loads an evidence row only if the caller can see its record (else 404). */
async function loadVisibleEvidence(actor, evidenceId) {
  const ev = await Evidence.findById(evidenceId).lean();
  if (!ev) throw ApiError.notFound('Evidence not found');
  const rec = await KpiRecord.findOne({
    _id: ev.kpi_record_id,
    organization_id: actor.organization_id,
    ...recordScopeFilter(actor),
  }).lean();
  if (!rec) throw ApiError.notFound('Evidence not found');
  return ev;
}

/** GET /evidence/:id/download — authenticated stream, never a public URL. */
async function openDownload(actor, evidenceId, { inline = false } = {}) {
  const ev = await loadVisibleEvidence(actor, evidenceId);
  const canInline = inline && (ev.mime_type === 'application/pdf' || ev.mime_type.startsWith('image/'));
  let stream;
  try {
    stream = storage.createReadStream(ev.file_url);
  } catch (err) {
    if (err.code === 'ENOENT') throw ApiError.notFound('Stored file is missing');
    throw err;
  }
  const encoded = encodeURIComponent(ev.file_name);
  return {
    stream,
    headers: {
      'Content-Type': ev.mime_type || 'application/octet-stream',
      'Content-Length': ev.file_size_bytes || undefined,
      'Content-Disposition': `${canInline ? 'inline' : 'attachment'}; filename="${ev.file_name.replace(/"/g, '')}"; filename*=UTF-8''${encoded}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  };
}

/** DELETE /evidence/:id — soft remove while the record is editable. */
async function remove(actor, evidenceId) {
  return withTransaction(async (session) => {
    const ev = await Evidence.findOne({ _id: evidenceId, is_active: true }).session(session);
    if (!ev) throw ApiError.notFound('Evidence not found');
    const rec = await loadOrgRecord(actor, ev.kpi_record_id, session);
    await loadOpenPeriod(rec, session);
    assertIsOwner(actor, rec);
    assertEditable(rec);

    ev.is_active = false;
    await ev.save({ session });
    await audit.log({
      session,
      user_id: actor.id,
      organization_id: actor.organization_id,
      entity_name: 'evidence',
      record_id: ev._id,
      action_name: 'REMOVE_EVIDENCE',
      previous_value: { is_active: true, file_name: ev.file_name },
      updated_value: { is_active: false },
    });
  });
}

module.exports = { upload, list, openDownload, remove, detectMime, sanitizeFileName };
