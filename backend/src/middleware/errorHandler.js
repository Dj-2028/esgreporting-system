'use strict';

const mongoose = require('mongoose');
const multer = require('multer');
const { ZodError } = require('zod');
const ApiError = require('../utils/ApiError');
const logger = require('../utils/logger');

/** 404 for unknown routes. */
function notFound(req, res, next) {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
}

/** Converts any thrown error into the standard error envelope (backend.md §6). */
// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  let apiErr = err;

  if (err instanceof ZodError) {
    apiErr = new ApiError(
      400,
      'VALIDATION_ERROR',
      'Some fields are invalid',
      err.issues.map((i) => ({ field: i.path.join('.'), message: i.message })),
    );
  } else if (err instanceof multer.MulterError) {
    apiErr =
      err.code === 'LIMIT_FILE_SIZE'
        ? new ApiError(413, 'FILE_TOO_LARGE', 'File exceeds the maximum allowed size')
        : new ApiError(400, 'VALIDATION_ERROR', err.message);
  } else if (err instanceof mongoose.Error.ValidationError) {
    apiErr = new ApiError(
      400,
      'VALIDATION_ERROR',
      'Some fields are invalid',
      Object.values(err.errors).map((e) => ({ field: e.path, message: e.message })),
    );
  } else if (err instanceof mongoose.Error.CastError) {
    apiErr = ApiError.notFound();
  } else if (err && err.code === 11000) {
    const field = Object.keys(err.keyPattern || err.keyValue || {}).pop();
    apiErr = new ApiError(
      409,
      'DUPLICATE',
      'A record with the same value already exists',
      field ? [{ field, message: 'Already exists' }] : undefined,
    );
  } else if (err && err.type === 'entity.parse.failed') {
    apiErr = new ApiError(400, 'VALIDATION_ERROR', 'Malformed JSON body');
  } else if (!(err instanceof ApiError)) {
    (req.log || logger).error({ err }, 'Unhandled error');
    apiErr = new ApiError(500, 'INTERNAL_ERROR', 'Something went wrong');
  }

  const body = {
    success: false,
    error: { code: apiErr.code, message: apiErr.message, request_id: req.id },
  };
  if (apiErr.details !== undefined) body.error.details = apiErr.details;

  res.status(apiErr.status || 500).json(body);
}

module.exports = { notFound, errorHandler };

