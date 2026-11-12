'use strict';

const env = require('../config/env');
const { ROLES } = require('../config/constants');
const ApiError = require('../utils/ApiError');

/**
 * Returns middleware that permits the caller only if they hold at least one
 * of the listed roles (backend.md §5.2).
 */
function authorize(...allowedRoles) {
  return function checkRole(req, _res, next) {
    if (!req.user) {
      return next(ApiError.unauthenticated('UNAUTHENTICATED', 'Authentication required'));
    }
    const userRoles = req.user.roles || [];
    const allowed = allowedRoles.some((r) => userRoles.includes(r));
    if (!allowed) {
      return next(ApiError.forbidden('FORBIDDEN', 'You do not have permission to perform this action'));
    }
    return next();
  };
}

/**
 * Checks that the caller is both an Admin and listed in `PLATFORM_ADMIN_EMAILS`
 * (or when `PLATFORM_ADMIN_EMAILS` is empty in dev, any Admin) — backend.md §7.5.
 */
function requirePlatformAdmin(req, _res, next) {
  if (!req.user) {
    return next(ApiError.unauthenticated('UNAUTHENTICATED', 'Authentication required'));
  }
  const isAdmin = (req.user.roles || []).includes(ROLES.ADMIN);
  if (!isAdmin) {
    return next(ApiError.forbidden('FORBIDDEN', 'Admin role required'));
  }
  if (
    env.PLATFORM_ADMIN_EMAILS.length > 0 &&
    !env.PLATFORM_ADMIN_EMAILS.includes(String(req.user.email).toLowerCase())
  ) {
    return next(
      ApiError.forbidden('FORBIDDEN', 'Only platform administrators may modify global reference data'),
    );
  }
  return next();
}

module.exports = { authorize, requirePlatformAdmin };

