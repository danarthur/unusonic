'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod/v4';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { instrument } from '@/shared/lib/instrumentation';
import { publishDomainEvent } from '@/shared/lib/domain-events/publish-domain-event';

/**
 * Show-state transitions for ops.events — CANONICAL WRITER (Pass 3 Phase 2).
 *
 * This file and `delete-event.ts::cancelEvent` are the two canonical writers
 * of the `(status, lifecycle_status)` pair on `ops.events`. Phase 0's DB
 * trigger `events_status_pair_check` enforces that the pair stays co-valid
 * at the database layer, so the dual-write pattern here is load-bearing
 * rather than a band-aid — any future writer that touches status or
 * lifecycle_status must update BOTH columns in the same statement or be
 * rejected by the trigger.
 *
 * Read-side consumers should use `readEventStatus()` from
 * `@/shared/lib/event-status/read-event-status.ts` rather than touching the
 * columns directly.
 *
 * Column pair we touch:
 *   - `status`: canonical lock signal read by `computeEventLock` for the
 *     client portal song-edit lock. Values: 'planned' | 'in_progress' |
 *     'completed' | 'cancelled' | 'archived'.
 *   - `lifecycle_status`: parallel state column read by CRM stream surfaces,
 *     Lobby PipelineVelocity, and Aion. Values: 'lead' | 'tentative' |
 *     'confirmed' | 'production' | 'live' | 'post' | 'cancelled' | 'archived'.
 *     Phase 0's `ops.event_status_pair_valid()` defines the legal pairings.
 *   - `show_started_at` / `show_ended_at`: audit trail; set atomically with
 *     status. Editable from the wrap report for late-press scenarios.
 *
 * Out of scope here:
 *   - 'cancelled' → see `delete-event.ts::cancelEvent` which writes both
 *     columns so computeEventLock locks cancelled events.
 *   - 'archived' → will be set by the wrap-report close-out flow (Phase 4).
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

    // Pass 3 Phase 3 — publish the domain event seam. Never throws; a
    // publish failure is captured to Sentry but does NOT roll back the
    // state transition. The Lobby's liveness wire does NOT depend on this
    // event (it reads show_started_at directly) — the table is the
    // Follow-Up Engine's future subscription point.
    await publishDomainEvent({
      workspaceId,
      eventId,
      type: 'show.started',
      payload: { startedAt },
    });

    // Plan lens + client portal song locks re-read on next navigation.
    revalidatePath('/events');
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

    const row = existing as { id: string; status: string | null; show_ended_at: string | null; show_started_at?: string | null };
    // Idempotent: calling End on an already-completed show just returns success
    if (row.status === 'completed' && row.show_ended_at) {
      return { success: true, eventId, endedAt: row.show_ended_at };
    }

    // Re-read show_started_at so we can include it in the domain event payload.
    // (The earlier select only pulled show_ended_at — grab the partner value
    // before the UPDATE so the event carries full context.)
    const { data: startedRow } = await supabase
      .schema('ops')
      .from('events')
      .select('show_started_at')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const priorStartedAt = (startedRow as { show_started_at?: string | null } | null)?.show_started_at ?? null;

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

    // Pass 3 Phase 3 — publish the domain event seam. See markShowStarted
    // above for the contract: never throws, publish failures go to Sentry,
    // state transition commits regardless.
    await publishDomainEvent({
      workspaceId,
      eventId,
      type: 'show.ended',
      payload: { endedAt, startedAt: priorStartedAt },
    });

    revalidatePath('/events');
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

    revalidatePath('/events');
    revalidatePath('/client/event');
    revalidatePath('/client/songs');

    return { success: true, eventId, startedAt: '' };
  });
}
