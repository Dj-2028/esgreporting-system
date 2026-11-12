'use strict';

/** Standard success envelope (backend.md §6). */
function ok(res, data, status = 200) {
  return res.status(status).json({ success: true, data });
}

function created(res, data) {
  return ok(res, data, 201);
}

function list(res, data, meta) {
  return res.status(200).json({ success: true, data, meta });
}

function noContent(res) {
  return res.status(204).end();
}

module.exports = { ok, created, list, noContent };

