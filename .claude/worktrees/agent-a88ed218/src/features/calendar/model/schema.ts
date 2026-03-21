/**
 * Calendar feature - Zod schemas for Server Action inputs
 * @module features/calendar/model/schema
 */

import { z } from 'zod';

const isoDateString = z
  .string()
  .min(1, 'Start/end date is required')
  .refine((s) => !Number.isNaN(Date.parse(s)), { message: 'Invalid ISO date string' });

export const getCalendarEventsInputSchema = z.object({
  start: isoDateString,
  end: isoDateString,
  workspaceId: z.string().uuid('Invalid workspace ID'),
});

export type GetCalendarEventsInputSchema = z.infer<typeof getCalendarEventsInputSchema>;
