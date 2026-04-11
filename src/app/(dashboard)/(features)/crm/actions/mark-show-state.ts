'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod/v4';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { instrument } from '@/shared/lib/instrumentation';

/**
 * Show-state transitions for ops.events.
 *
 * Why this file exists:
 *   `ops.events.status` defaults to 'planned' and is read by
 *   `shared/lib/client-portal/event-lock.ts::computeEventLock` to drive the
 *   client portal song-edit lock. But prior to 2026-04-11 nothing ever wrote
 *   the column post-default, so the lock never activated. These actions wire
 *   the missing transitions.
 *
 * Column pair we touch:
 *   - `status`: canonical lock signal read by computeEventLock.
 *     'planned' → 'in_progress' → 'completed'. Free-form text at the DB level.
 *   - `lifecycle_status`: parallel state column read by some CRM surfaces and
 *     by Aion / cortex memory. Kept in sync by these actions: 'live' while the
 *     show is in_progress, 'post' once completed. Merging status and
 *     lifecycle_status into one column is Pass 3 schema-drift work.
 *   - `show_started_at` / `show_ended_at`: audit trail; set atomically with
 *     status. Editable from the wrap report for late-press scenarios.
 *
 * Out of scope here:
 *   - 'cancelled' → see `delete-event.ts::cancelEvent` which writes both
 *     `lifecycle_status='cancelled'` and `status='cancelled'` so
 *     computeEventLock locks cancelled events.
 *   - 'archived' → set by the wrap-report close-out flow (Pass 3).
 */

const EventIdSchema = z.string().uuid();

export type ShowStateResult =
  | { success: true; eventId: string; startedAt: string }
  | { success: true; eventId: string; endedAt: string }
  | { success: false; error: string };

/**
 * Mark an event as the show being live. Flips status → 'in_progress' and
 * stamps show_started_at. Locks the client portal song-edit flow via
 * computeEventLock.
 */
export async function markShowStarted(eventId: string): Promise<ShowStateResult> {
  return instrument('markShowStarted', async () => {
    const parsed = EventIdSchema.safeParse(eventId);
    if (!parsed.success) return { success: false, error: 'Invalid event id.' };

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    // Verify ownership + read current state before transitioning
    const { data: existing, error: fetchErr } = await supabase
      .schema('ops')
      .from('events')
      .select('id, status, show_started_at')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (fetchErr) return { success: false, error: fetchErr.message };
    if (!existing) return { success: false, error: 'Event not found.' };

    const row = existing as { id: string; status: string | null; show_started_at: string | null };
    // Idempotent: calling Start on an already-live show just returns success
    if (row.status === 'in_progress' && row.show_started_at) {
      return { success: true, eventId, startedAt: row.show_started_at };
    }

    const startedAt = new Date().toISOString();
    const { error: updateErr } = await supabase
      .schema('ops')
      .from('events')
      .update({
        status: 'in_progress',
        lifecycle_status: 'live',
        show_started_at: startedAt,
      })
      .eq('id', eventId)
      .eq('workspace_id', workspaceId);

    if (updateErr) {
      Sentry.logger.error('crm.markShowStarted.updateFailed', {
        eventId,
        workspaceId,
        error: updateErr.message,
      });
      return { success: false, error: updateErr.message };
    }

    // Plan lens + client portal song locks re-read on next navigation.
    revalidatePath('/crm');
    revalidatePath('/client/event');
    revalidatePath('/client/songs');

    return { success: true, eventId, startedAt };
  });
}

/**
 * Mark an event as the show having ended. Flips status → 'completed' and
 * stamps show_ended_at. Locks the client portal entirely and opens the wrap
 * report affordance on the Plan lens.
 */
export async function markShowEnded(eventId: string): Promise<ShowStateResult> {
  return instrument('markShowEnded', async () => {
    const parsed = EventIdSchema.safeParse(eventId);
    if (!parsed.success) return { success: false, error: 'Invalid event id.' };

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    const { data: existing, error: fetchErr } = await supabase
      .schema('ops')
      .from('events')
      .select('id, status, show_ended_at')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (fetchErr) return { success: false, error: fetchErr.message };
    if (!existing) return { success: false, error: 'Event not found.' };

    const row = existing as { id: string; status: string | null; show_ended_at: string | null };
    // Idempotent: calling End on an already-completed show just returns success
    if (row.status === 'completed' && row.show_ended_at) {
      return { success: true, eventId, endedAt: row.show_ended_at };
    }

    const endedAt = new Date().toISOString();
    const { error: updateErr } = await supabase
      .schema('ops')
      .from('events')
      .update({
        status: 'completed',
        lifecycle_status: 'post',
        show_ended_at: endedAt,
      })
      .eq('id', eventId)
      .eq('workspace_id', workspaceId);

    if (updateErr) {
      Sentry.logger.error('crm.markShowEnded.updateFailed', {
        eventId,
        workspaceId,
        error: updateErr.message,
      });
      return { success: false, error: updateErr.message };
    }

    revalidatePath('/crm');
    revalidatePath('/client/event');
    revalidatePath('/client/songs');

    return { success: true, eventId, endedAt };
  });
}

/**
 * Undo a Start-Show press. Used by the 10-second undo toast on the Plan lens.
 * Reverts to 'planned' and clears show_started_at. Refuses if the show has
 * already been marked ended (not an undo window concern).
 */
export async function undoMarkShowStarted(eventId: string): Promise<ShowStateResult> {
  return instrument('undoMarkShowStarted', async () => {
    const parsed = EventIdSchema.safeParse(eventId);
    if (!parsed.success) return { success: false, error: 'Invalid event id.' };

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    const { data: existing, error: fetchErr } = await supabase
      .schema('ops')
      .from('events')
      .select('id, status, show_ended_at')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (fetchErr) return { success: false, error: fetchErr.message };
    if (!existing) return { success: false, error: 'Event not found.' };

    const row = existing as { id: string; status: string | null; show_ended_at: string | null };
    if (row.status !== 'in_progress') {
      return { success: false, error: 'Show is not marked as started.' };
    }
    if (row.show_ended_at) {
      return { success: false, error: 'Show already ended — cannot undo.' };
    }

    // Revert to 'planned' status and the most common pre-show lifecycle_status.
    // The true previous lifecycle_status isn't captured (would need a history
    // row to do it right); 'production' is the closest generic revert for a
    // show that was mid-dispatch when it got started by mistake.
    const { error: updateErr } = await supabase
      .schema('ops')
      .from('events')
      .update({
        status: 'planned',
        lifecycle_status: 'production',
        show_started_at: null,
      })
      .eq('id', eventId)
      .eq('workspace_id', workspaceId);

    if (updateErr) {
      Sentry.logger.error('crm.undoMarkShowStarted.updateFailed', {
        eventId,
        workspaceId,
        error: updateErr.message,
      });
      return { success: false, error: updateErr.message };
    }

    revalidatePath('/crm');
    revalidatePath('/client/event');
    revalidatePath('/client/songs');

    return { success: true, eventId, startedAt: '' };
  });
}
