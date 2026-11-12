'use strict';

const { PAGINATION } = require('../config/constants');

/**
 * Parses `page`, `limit`, `sort` query params (backend.md §6).
 * `sort` like `-created_at,kpi_code` → `{ created_at: -1, kpi_code: 1 }`.
 */
function parsePagination(query = {}, { defaultSort = '-created_at', allowedSort } = {}) {
  const page = Math.max(1, parseInt(query.page, 10) || 1);
  const rawLimit = parseInt(query.limit, 10) || PAGINATION.DEFAULT_LIMIT;
  const limit = Math.min(PAGINATION.MAX_LIMIT, Math.max(1, rawLimit));

  const sort = {};
  String(query.sort || defaultSort)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .forEach((field) => {
      const dir = field.startsWith('-') ? -1 : 1;
      const name = field.replace(/^[-+]/, '');
      if (!allowedSort || allowedSort.includes(name)) sort[name] = dir;
    });
  if (!Object.keys(sort).length) sort._id = -1;

  return { page, limit, skip: (page - 1) * limit, sort };
}

function buildMeta({ page, limit }, total) {
  return { page, limit, total, total_pages: Math.ceil(total / limit) };
}

/** Escapes user input for safe use inside a case-insensitive RegExp search. */
function searchRegex(q) {
  if (!q) return null;
  return new RegExp(String(q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

module.exports = { parsePagination, buildMeta, searchRegex };

