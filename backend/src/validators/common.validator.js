'use strict';

const { z } = require('zod');
const { KPI_FREQUENCY } = require('../config/constants');

const objectId = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

const email = z
  .string()
  .trim()
  .max(255)
  .email('Invalid email address')
  .transform((v) => v.toLowerCase());

const password = z
  .string()
  .min(10, 'Password must be at least 10 characters')
  .max(128, 'Password must be at most 128 characters')
  .refine((v) => /[A-Z]/.test(v), 'Password must contain at least one uppercase letter')
  .refine((v) => /[a-z]/.test(v), 'Password must contain at least one lowercase letter')
  .refine((v) => /[0-9]/.test(v), 'Password must contain at least one digit');

const organizationCode = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{2,50}$/, 'Code must be 2–50 uppercase letters, digits, _ or -');

const shortCode = z
  .string()
  .trim()
  .min(2, 'Code must be at least 2 characters')
  .max(50, 'Code must be at most 50 characters')
  .regex(/^[A-Za-z0-9._-]+$/, 'Code may only contain letters, digits, ., _ or -');

const decimalValue = z
  .number({ invalid_type_error: 'Must be a number' })
  .finite('Must be a finite number')
  .min(0, 'Must be 0 or greater')
  .max(1e14, 'Value exceeds maximum allowed')
  .refine((v) => {
    const parts = String(v).split('.');
    return !parts[1] || parts[1].length <= 6;
  }, 'Up to 6 decimal places allowed');

const reasonText = z.string().trim().min(5, 'Must be at least 5 characters').max(500);
const remarkText = z.string().trim().min(5, 'Remark must be at least 5 characters').max(2000);

const idParamSchema = z.object({ id: objectId });

const kpiFrequency = z.enum(KPI_FREQUENCY);

module.exports = {
  objectId,
  email,
  password,
  organizationCode,
  shortCode,
  decimalValue,
  reasonText,
  remarkText,
  idParamSchema,
  kpiFrequency,
};

