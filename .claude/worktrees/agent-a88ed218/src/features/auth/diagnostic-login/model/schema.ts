/**
 * Diagnostic Login Feature - Validation Schemas
 * @module features/auth/diagnostic-login/model/schema
 */

import { z } from 'zod';

export const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(1, 'Password is required'),
});

export type LoginInput = z.infer<typeof loginSchema>;
