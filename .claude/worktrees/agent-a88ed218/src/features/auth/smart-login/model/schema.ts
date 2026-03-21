/**
 * Smart Login Feature - Validation Schemas
 * @module features/auth/smart-login/model/schema
 */

import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  password: z
    .string()
    .min(1, 'Password is required')
    .min(6, 'Password must be at least 6 characters'),
});

export const signupSchema = z.object({
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
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
  email: z
    .string()
    .min(1, 'Email is required')
    .email('Please enter a valid email address'),
  fullName: z
    .string()
    .min(1, 'Name is required')
    .min(2, 'Name must be at least 2 characters'),
});

export type LoginInput = z.infer<typeof loginSchema>;
export type SignupInput = z.infer<typeof signupSchema>;
export type SignupForPasskeyInput = z.infer<typeof signupForPasskeySchema>;