'use strict';

const asyncHandler = require('../utils/asyncHandler');
const { ok, created, noContent } = require('../utils/respond');
const authService = require('../services/auth.service');

const registerOrganization = asyncHandler(async (req, res) => {
  const result = await authService.registerOrganization(req.body);
  return created(res, result);
});

const login = asyncHandler(async (req, res) => {
  const { access_token, refresh_token, user } = await authService.login(req.body);
  res.cookie(
    authService.REFRESH_COOKIE_NAME,
    refresh_token,
    authService.getRefreshCookieOptions(),
  );
  return ok(res, { access_token, user });
});

const refresh = asyncHandler(async (req, res) => {
  const raw = req.cookies ? req.cookies[authService.REFRESH_COOKIE_NAME] : null;
  const { access_token, refresh_token } = await authService.refresh(raw);
  res.cookie(
    authService.REFRESH_COOKIE_NAME,
    refresh_token,
    authService.getRefreshCookieOptions(),
  );
  return ok(res, { access_token });
});

const logout = asyncHandler(async (req, res) => {
  const raw = req.cookies ? req.cookies[authService.REFRESH_COOKIE_NAME] : null;
  await authService.logout(raw);
  res.clearCookie(authService.REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
  return noContent(res);
});

const me = asyncHandler(async (req, res) => {
  const profile = await authService.buildUserProfile(req.user._id);
  return ok(res, profile);
});

const changePassword = asyncHandler(async (req, res) => {
  await authService.changePassword(req.user._id, req.body);
  res.clearCookie(authService.REFRESH_COOKIE_NAME, { path: '/api/v1/auth' });
  return noContent(res);
});

const forgotPassword = asyncHandler(async (req, res) => {
  await authService.forgotPassword(req.body);
  return ok(res, { message: 'If an account exists for that email, a reset link has been sent' });
});

const resetPassword = asyncHandler(async (req, res) => {
  await authService.resetPassword(req.body);
  return noContent(res);
});

module.exports = {
  registerOrganization,
  login,
  refresh,
  logout,
  me,
  changePassword,
  forgotPassword,
  resetPassword,
};

