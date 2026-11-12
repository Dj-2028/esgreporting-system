'use strict';

const crypto = require('crypto');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');

const env = require('../config/env');
const { ROLES } = require('../config/constants');
const ApiError = require('../utils/ApiError');
const withTransaction = require('../utils/withTransaction');
const { sha256, randomToken } = require('../utils/hash');
const audit = require('./audit.service');
const notification = require('./notification.service');
const {
  Organization,
  Department,
  AppUser,
  Role,
  UserRole,
  RefreshToken,
  PasswordResetToken,
} = require('../models');

const REFRESH_COOKIE_NAME = 'esg_refresh';

function parseDurationMs(ttl) {
  const match = /^(\d+)([smhd])$/.exec(String(ttl).trim());
  if (!match) return 7 * 24 * 60 * 60 * 1000;
  const n = Number(match[1]);
  const unit = match[2];
  const factor = { s: 1000, m: 60000, h: 3600000, d: 86400000 }[unit];
  return n * factor;
}

function getRefreshCookieOptions() {
  const secure = Boolean(env.COOKIE_SECURE);
  return {
    httpOnly: true,
    sameSite: secure ? 'none' : 'strict',
    secure,
    path: '/api/v1/auth',
    maxAge: parseDurationMs(env.JWT_REFRESH_TTL),
  };
}

async function ensureAdminRole(session) {
  let adminRole = await Role.findOne({ role_name: ROLES.ADMIN }).session(session || null);
  if (!adminRole) {
    const [created] = await Role.create(
      [
        {
          role_name: ROLES.ADMIN,
          role_description: 'Sustainability lead / system owner',
          is_active: true,
        },
      ],
      session ? { session } : {},
    );
    adminRole = created;
  }
  return adminRole;
}

async function getActiveRoleNames(userId, session = null) {
  const rows = await UserRole.find({ user_id: userId, is_active: true })
    .populate('role_id')
    .session(session)
    .lean();
  return rows.filter((r) => r.role_id && r.role_id.is_active).map((r) => r.role_id.role_name);
}

function signAccessToken({ userId, organizationId, roles }) {
  return jwt.sign(
    { sub: String(userId), org: String(organizationId), roles },
    env.JWT_ACCESS_SECRET,
    { expiresIn: env.JWT_ACCESS_TTL },
  );
}

async function issueRefreshToken(userId, familyId = crypto.randomUUID()) {
  const jti = randomToken(32);
  const ttlMs = parseDurationMs(env.JWT_REFRESH_TTL);
  const expiresAt = new Date(Date.now() + ttlMs);

  const token = jwt.sign(
    { sub: String(userId), jti, fam: familyId },
    env.JWT_REFRESH_SECRET,
    { expiresIn: env.JWT_REFRESH_TTL },
  );

  await RefreshToken.create({
    user_id: userId,
    family_id: familyId,
    jti_hash: sha256(jti),
    expires_at: expiresAt,
  });

  return token;
}

/**
 * Registers a new organisation and its first Admin user in one transaction
 * (workflow.md §2, backend.md §8.1).
 */
async function registerOrganization({
  organization_name,
  organization_code,
  display_name,
  email,
  password,
}) {
  const password_hash = await bcrypt.hash(password, env.BCRYPT_COST);

  return withTransaction(async (session) => {
    const existingOrg = await Organization.findOne({
      $or: [{ organization_name }, { organization_code }],
    })
      .session(session)
      .lean();
    if (existingOrg) {
      const field =
        existingOrg.organization_code === organization_code
          ? 'organization_code'
          : 'organization_name';
      throw ApiError.conflict('DUPLICATE', `Organisation ${field} already exists`, [
        { field, message: 'Already in use' },
      ]);
    }

    const existingUser = await AppUser.findOne({ email }).session(session).lean();
    if (existingUser) {
      throw ApiError.conflict('DUPLICATE', 'Email already registered', [
        { field: 'email', message: 'Email is already in use' },
      ]);
    }

    const [org] = await Organization.create(
      [{ organization_name, organization_code, is_active: true }],
      { session },
    );

    const [user] = await AppUser.create(
      [
        {
          organization_id: org._id,
          email,
          display_name,
          password_hash,
          must_change_password: false,
          is_active: true,
        },
      ],
      { session },
    );

    const adminRole = await ensureAdminRole(session);
    const [userRole] = await UserRole.create(
      [
        {
          user_id: user._id,
          role_id: adminRole._id,
          assigned_by_user_id: user._id,
          is_active: true,
        },
      ],
      { session },
    );

    await audit.log({
      session,
      user_id: user._id,
      organization_id: org._id,
      entity_name: 'organization',
      record_id: org._id,
      action_name: 'CREATE',
      updated_value: org,
    });
    await audit.log({
      session,
      user_id: user._id,
      organization_id: org._id,
      entity_name: 'app_user',
      record_id: user._id,
      action_name: 'CREATE',
      updated_value: user,
    });
    await audit.log({
      session,
      user_id: user._id,
      organization_id: org._id,
      entity_name: 'user_role',
      record_id: userRole._id,
      action_name: 'ASSIGN_ROLE',
      updated_value: { user_id: user._id, role_name: ROLES.ADMIN },
    });

    return {
      organization: org.toJSON(),
      user: {
        id: String(user._id),
        email: user.email,
        display_name: user.display_name,
        organization_id: String(org._id),
        roles: [ROLES.ADMIN],
      },
    };
  });
}

async function buildUserProfile(userId) {
  const user = await AppUser.findById(userId).lean();
  if (!user) throw ApiError.unauthenticated('UNAUTHENTICATED', 'User not found');

  const [org, dept, roles] = await Promise.all([
    Organization.findById(user.organization_id).lean(),
    user.department_id ? Department.findById(user.department_id).lean() : null,
    getActiveRoleNames(user._id),
  ]);

  return {
    id: String(user._id),
    email: user.email,
    display_name: user.display_name,
    organization: org
      ? {
          id: String(org._id),
          organization_name: org.organization_name,
          organization_code: org.organization_code,
        }
      : null,
    department: dept
      ? {
          id: String(dept._id),
          department_name: dept.department_name,
          department_code: dept.department_code,
        }
      : null,
    roles,
    must_change_password: Boolean(user.must_change_password),
    last_login_at: user.last_login_at,
  };
}

/**
 * Authenticates a user by email + password (workflow.md §3).
 */
async function login({ email, password }) {
  const user = await AppUser.findOne({ email }).select('+password_hash');
  if (!user) {
    throw ApiError.unauthenticated('INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  const matches = await bcrypt.compare(password, user.password_hash);
  if (!matches) {
    await audit.log({
      user_id: user._id,
      organization_id: user.organization_id,
      entity_name: 'app_user',
      record_id: user._id,
      action_name: 'LOGIN_FAILED',
      updated_value: { email: user.email },
    });
    throw ApiError.unauthenticated('INVALID_CREDENTIALS', 'Email or password is incorrect');
  }

  if (!user.is_active) {
    throw ApiError.forbidden('ACCOUNT_DISABLED', 'Your account has been deactivated');
  }

  const org = await Organization.findById(user.organization_id).lean();
  if (!org || !org.is_active) {
    throw ApiError.forbidden('ACCOUNT_DISABLED', 'Your organisation is deactivated');
  }

  const roles = await getActiveRoleNames(user._id);
  user.last_login_at = new Date();
  await user.save();

  await audit.log({
    user_id: user._id,
    organization_id: user.organization_id,
    entity_name: 'app_user',
    record_id: user._id,
    action_name: 'LOGIN',
    updated_value: { last_login_at: user.last_login_at },
  });

  const accessToken = signAccessToken({
    userId: user._id,
    organizationId: user.organization_id,
    roles,
  });
  const refreshToken = await issueRefreshToken(user._id);
  const profile = await buildUserProfile(user._id);

  return { access_token: accessToken, refresh_token: refreshToken, user: profile };
}

/**
 * Rotates the refresh token and issues a new access token (backend.md §5.1).
 * Reuse of a revoked token revokes the entire token family.
 */
async function refresh(rawRefreshToken) {
  if (!rawRefreshToken) {
    throw ApiError.unauthenticated('UNAUTHENTICATED', 'Refresh token missing');
  }

  let payload;
  try {
    payload = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET);
  } catch {
    throw ApiError.unauthenticated('UNAUTHENTICATED', 'Invalid or expired refresh token');
  }

  const jtiHash = sha256(payload.jti || '');
  const tokenDoc = await RefreshToken.findOne({ jti_hash: jtiHash });
  if (!tokenDoc) {
    throw ApiError.unauthenticated('UNAUTHENTICATED', 'Refresh token not recognised');
  }

  if (tokenDoc.revoked_at) {
    // Reuse detected — revoke the whole family
    await RefreshToken.updateMany(
      { family_id: tokenDoc.family_id, revoked_at: null },
      { $set: { revoked_at: new Date() } },
    );
    throw ApiError.unauthenticated('UNAUTHENTICATED', 'Refresh token has been revoked');
  }

  if (tokenDoc.expires_at < new Date()) {
    throw ApiError.unauthenticated('UNAUTHENTICATED', 'Refresh token expired');
  }

  const user = await AppUser.findById(tokenDoc.user_id).lean();
  if (!user || !user.is_active) {
    throw ApiError.forbidden('ACCOUNT_DISABLED', 'User account is deactivated');
  }
  const org = await Organization.findById(user.organization_id).lean();
  if (!org || !org.is_active) {
    throw ApiError.forbidden('ACCOUNT_DISABLED', 'Organisation is deactivated');
  }

  tokenDoc.revoked_at = new Date();
  await tokenDoc.save();

  const roles = await getActiveRoleNames(user._id);
  const accessToken = signAccessToken({
    userId: user._id,
    organizationId: user.organization_id,
    roles,
  });
  const newRefreshToken = await issueRefreshToken(user._id, tokenDoc.family_id);

  return { access_token: accessToken, refresh_token: newRefreshToken };
}

async function logout(rawRefreshToken) {
  if (!rawRefreshToken) return;
  try {
    const payload = jwt.verify(rawRefreshToken, env.JWT_REFRESH_SECRET, {
      ignoreExpiration: true,
    });
    if (payload && payload.jti) {
      await RefreshToken.updateOne(
        { jti_hash: sha256(payload.jti), revoked_at: null },
        { $set: { revoked_at: new Date() } },
      );
    }
  } catch {
    // Ignore malformed cookies on logout
  }
}

async function changePassword(userId, { current_password, new_password }) {
  const user = await AppUser.findById(userId).select('+password_hash');
  if (!user) throw ApiError.notFound('User not found');

  const matches = await bcrypt.compare(current_password, user.password_hash);
  if (!matches) {
    throw ApiError.badRequest('VALIDATION_ERROR', 'Current password is incorrect', [
      { field: 'current_password', message: 'Current password is incorrect' },
    ]);
  }

  user.password_hash = await bcrypt.hash(new_password, env.BCRYPT_COST);
  user.must_change_password = false;
  await user.save();

  await RefreshToken.updateMany(
    { user_id: user._id, revoked_at: null },
    { $set: { revoked_at: new Date() } },
  );

  await audit.log({
    user_id: user._id,
    organization_id: user.organization_id,
    entity_name: 'app_user',
    record_id: user._id,
    action_name: 'UPDATE',
    previous_value: { password_changed: false },
    updated_value: { password_changed: true },
  });
}

async function forgotPassword({ email }) {
  const user = await AppUser.findOne({ email, is_active: true }).lean();
  if (!user) return; // Always 200 — no user enumeration

  const rawToken = randomToken(32);
  const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes (F-103)

  await PasswordResetToken.create({
    user_id: user._id,
    token_hash: sha256(rawToken),
    expires_at: expiresAt,
  });

  await notification.sendPasswordResetEmail({
    email: user.email,
    display_name: user.display_name,
    token: rawToken,
  });
}

async function resetPassword({ token, new_password }) {
  const tokenDoc = await PasswordResetToken.findOne({
    token_hash: sha256(token),
    used_at: null,
    expires_at: { $gt: new Date() },
  });
  if (!tokenDoc) {
    throw ApiError.badRequest('VALIDATION_ERROR', 'Invalid or expired password reset link', [
      { field: 'token', message: 'Reset link is invalid or has expired' },
    ]);
  }

  const user = await AppUser.findById(tokenDoc.user_id);
  if (!user || !user.is_active) {
    throw ApiError.badRequest('VALIDATION_ERROR', 'Invalid password reset request');
  }

  user.password_hash = await bcrypt.hash(new_password, env.BCRYPT_COST);
  user.must_change_password = false;
  await user.save();

  tokenDoc.used_at = new Date();
  await tokenDoc.save();

  await RefreshToken.updateMany(
    { user_id: user._id, revoked_at: null },
    { $set: { revoked_at: new Date() } },
  );

  await audit.log({
    user_id: user._id,
    organization_id: user.organization_id,
    entity_name: 'app_user',
    record_id: user._id,
    action_name: 'UPDATE',
    updated_value: { password_reset: true },
  });
}

module.exports = {
  REFRESH_COOKIE_NAME,
  getRefreshCookieOptions,
  registerOrganization,
  login,
  refresh,
  logout,
  buildUserProfile,
  changePassword,
  forgotPassword,
  resetPassword,
  getActiveRoleNames,
};

