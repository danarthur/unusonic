'use server';

/**
 * snoozeThread — set or clear the snooze state on a thread.
 *
 * UI maps the three options (4h / Tomorrow / Next week) to concrete
 * timestamps server-side so the client can't accidentally pass a past
 * timestamp (which would no-op) or the year 3000 (which would effectively
 * delete the thread from the active surface).
 *
 * @module features/comms/replies/api/snooze-thread
 */

import { revalidatePath } from 'next/cache';
import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';

export type SnoozeDuration = '4h' | 'tomorrow' | 'next_week' | 'clear';

const inputSchema = z.object({
  threadId: z.string().uuid(),
  duration: z.enum(['4h', 'tomorrow', 'next_week', 'clear']),
});

export type SnoozeThreadResult =
  | { success: true; snoozedUntil: string | null }
  | { success: false; error: string };

function computeSnoozedUntil(duration: SnoozeDuration): Date | null {
  if (duration === 'clear') return null;

  const now = new Date();
  if (duration === '4h') {
    return new Date(now.getTime() + 4 * 60 * 60 * 1000);
  }

  // "tomorrow" = 8am next calendar day in the user's local time. We return
  // an ISO string representing that local 8am; Postgres stores as UTC but
  // the semantic is "8am tomorrow where the user is."
  if (duration === 'tomorrow') {
    const tmrw = new Date(now);
    tmrw.setDate(tmrw.getDate() + 1);
    tmrw.setHours(8, 0, 0, 0);
    return tmrw;
  }

  // "next_week" = 8am next Monday.
  if (duration === 'next_week') {
    const next = new Date(now);
    const daysUntilMonday = (8 - next.getDay()) % 7 || 7; // 7 if today is Monday
    next.setDate(next.getDate() + daysUntilMonday);
    next.setHours(8, 0, 0, 0);
    return next;
  }

  return null;
}

export async function snoozeThread(input: {
  threadId: string;
  duration: SnoozeDuration;
}): Promise<SnoozeThreadResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' };
  }

  const until = computeSnoozedUntil(parsed.data.duration);

  try {
    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST exposed schemas
    const opsClient: any = supabase.schema('ops');

    const { error } = await opsClient.rpc('snooze_thread', {
      p_thread_id: parsed.data.threadId,
      p_snoozed_until: until ? until.toISOString() : null,
    });

    if (error) {
      return { success: false, error: error.message };
    }

    // Invalidate the CRM surfaces that render the thread state.
    revalidatePath('/events', 'layout');

    return { success: true, snoozedUntil: until ? until.toISOString() : null };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unexpected error while snoozing thread',
    };
  }
}
