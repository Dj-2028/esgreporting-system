'use strict';

const { z } = require('zod');
const { email, password, organizationCode } = require('./common.validator');

const registerOrganizationBody = z.object({
  organization_name: z.string().trim().min(1, 'Organisation name is required').max(200),
  organization_code: organizationCode,
  display_name: z.string().trim().min(1, 'Display name is required').max(150),
  email,
  password,
});

const loginBody = z.object({
  email,
  password: z.string().min(1, 'Password is required'),
});

const changePasswordBody = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: password,
});

const forgotPasswordBody = z.object({
  email,
});

const resetPasswordBody = z.object({
  token: z.string().trim().min(1, 'Reset token is required'),
  new_password: password,
});

module.exports = {
  registerOrganizationBody,
  loginBody,
  changePasswordBody,
  forgotPasswordBody,
  resetPasswordBody,
};

