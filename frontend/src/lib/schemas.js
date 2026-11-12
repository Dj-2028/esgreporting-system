import { z } from 'zod';

export const emailSchema = z.string().trim().min(1, 'Email is required').email('Enter a valid email');

export const passwordPolicySchema = z
  .string()
  .min(10, 'At least 10 characters')
  .max(128, 'At most 128 characters')
  .refine((v) => /[A-Z]/.test(v), 'Include an uppercase letter')
  .refine((v) => /[a-z]/.test(v), 'Include a lowercase letter')
  .refine((v) => /[0-9]/.test(v), 'Include a digit');

export const orgCodeSchema = z
  .string()
  .trim()
  .toUpperCase()
  .regex(/^[A-Z0-9_-]{2,50}$/, '2–50 uppercase letters, digits, _ or -');

export const shortCodeSchema = z
  .string()
  .trim()
  .min(2, 'At least 2 characters')
  .max(50, 'At most 50 characters')
  .regex(/^[A-Za-z0-9._-]+$/, 'Letters, digits, ., _ or - only');

export const remarkSchema = z
  .string()
  .trim()
  .min(5, 'Enter at least 5 characters')
  .max(2000, 'At most 2000 characters');

export const reasonSchema = z
  .string()
  .trim()
  .min(5, 'Enter at least 5 characters')
  .max(500, 'At most 500 characters');

