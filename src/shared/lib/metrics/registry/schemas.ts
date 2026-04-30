/**
 * Shared zod schemas for metric argsSchema definitions.
 *
 * Extracted from registry.ts (Phase 0.5-style split, 2026-04-29).
 */

import { z } from 'zod';

export const periodSchema = z.object({
  period_start: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  period_end: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD'),
  tz: z.string().optional(),
  compare: z.boolean().optional(),
});

export const noArgsSchema = z.object({});

export const yearSchema = z.object({
  year: z.number().int().min(2000).max(2100),
});

export const daysWindowSchema = z.object({
  days: z.number().int().min(1).max(365).optional(),
});
