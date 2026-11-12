'use strict';

/**
 * Application error carrying an HTTP status and a stable error code
 * (backend.md §6.1). `details` is either a field list for validation errors
 * or an object with extra context (e.g. `{ current: 'Approved' }`).
 */
class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message || code);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    if (details !== undefined) this.details = details;
  }

  static badRequest(code = 'VALIDATION_ERROR', message, details) {
    return new ApiError(400, code, message, details);
  }

  static unauthenticated(code = 'UNAUTHENTICATED', message) {
    return new ApiError(401, code, message);
  }

  static forbidden(code = 'FORBIDDEN', message) {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Resource not found') {
    return new ApiError(404, 'NOT_FOUND', message);
  }

  static conflict(code, message, details) {
    return new ApiError(409, code, message, details);
  }

  static unprocessable(code, message, details) {
    return new ApiError(422, code, message, details);
  }
}

module.exports = ApiError;

