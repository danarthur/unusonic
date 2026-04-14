/**
 * Smart Login Feature - Validation Schemas
 * @module features/auth/smart-login/model/schema
 */

import { z } from 'zod';

// Single source of truth: trim + lowercase emails before validation so callers
// can't bypass case normalization by skipping the client-side helper.
const emailField = z
  .string()
  .min(1, 'Email is required')
  .transform((v) => v.trim().toLowerCase())
  .pipe(z.string().email('Please enter a valid email address'));

export const loginSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

export const signupSchema = z.object({
  email: emailField,
  password: z
    .string()
    .min(1, 'Password is required')
    .min(8, 'Password must be at least 8 characters')
    .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
    .regex(/[0-9]/, 'Password must contain at least one number'),
  fullName: z
    .string()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters'),
});

/** Signup for passkey-only flow: no password; server creates user with random password. */
export const signupForPasskeySchema = z.object({
  email: emailField,
  fullName: z
    .string()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters'),
});

/** Email OTP: send code to email, then verify the 6-digit code. */
export const otpEmailSchema = z.object({
  email: emailField,
});

export const otpVerifySchema = z.object({
  email: emailField,
  token: z
    .string()
    .min(6, 'Enter the 6-digit code')
    .max(6, 'Enter the 6-digit code'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type SignupForPasskeyInput = z.infer<typeof signupForPasskeySchema>;
export type OtpEmailInput = z.infer<typeof otpEmailSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;