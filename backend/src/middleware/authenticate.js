'use strict';

const jwt = require('jsonwebtoken');
const env = require('../config/env');
const ApiError = require('../utils/ApiError');
const { AppUser, Organization } = require('../models');

/**
 * Verifies the Bearer access token, checks that both the user and their
 * organisation are active, and populates `req.user` (backend.md §5.2).
 */
async function authenticate(req, _res, next) {
  try {
    const header = req.headers.authorization || '';
    const [scheme, token] = header.split(' ');
    if (scheme !== 'Bearer' || !token) {
      throw ApiError.unauthenticated('UNAUTHENTICATED', 'Authentication required');
    }

    let payload;
    try {
      payload = jwt.verify(token, env.JWT_ACCESS_SECRET);
    } catch (err) {
      if (err && err.name === 'TokenExpiredError') {
        throw ApiError.unauthenticated('TOKEN_EXPIRED', 'Access token has expired');
      }
      throw ApiError.unauthenticated('UNAUTHENTICATED', 'Invalid access token');
    }

    const user = await AppUser.findById(payload.sub).lean();
    if (!user) {
      throw ApiError.unauthenticated('UNAUTHENTICATED', 'User not found');
    }
    if (!user.is_active) {
      throw ApiError.forbidden('ACCOUNT_DISABLED', 'User account is deactivated');
    }

    const org = await Organization.findById(user.organization_id).lean();
    if (!org || !org.is_active) {
      throw ApiError.forbidden('ACCOUNT_DISABLED', 'Organisation is deactivated');
    }

    req.user = {
      id: String(user._id),
      _id: user._id,
      email: user.email,
      display_name: user.display_name,
      organization_id: user.organization_id,
      department_id: user.department_id,
      roles: Array.isArray(payload.roles) ? payload.roles : [],
      must_change_password: Boolean(user.must_change_password),
    };
    next();
  } catch (err) {
    next(err);
  }
}

module.exports = authenticate;

