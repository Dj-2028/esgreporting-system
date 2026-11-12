'use strict';

const express = require('express');
const authenticate = require('../middleware/authenticate');
const validate = require('../middleware/validate');
const { loginLimiter, authLimiter } = require('../middleware/rateLimit');
const authValidator = require('../validators/auth.validator');
const authController = require('../controllers/auth.controller');

const router = express.Router();

router.post(
  '/register-organization',
  authLimiter,
  validate({ body: authValidator.registerOrganizationBody }),
  authController.registerOrganization,
);

router.post(
  '/login',
  loginLimiter,
  validate({ body: authValidator.loginBody }),
  authController.login,
);

router.post('/refresh', authController.refresh);

router.post('/logout', authenticate, authController.logout);

router.get('/me', authenticate, authController.me);

router.post(
  '/change-password',
  authenticate,
  validate({ body: authValidator.changePasswordBody }),
  authController.changePassword,
);

router.post(
  '/forgot-password',
  authLimiter,
  validate({ body: authValidator.forgotPasswordBody }),
  authController.forgotPassword,
);

router.post(
  '/reset-password',
  authLimiter,
  validate({ body: authValidator.resetPasswordBody }),
  authController.resetPassword,
);

module.exports = router;

