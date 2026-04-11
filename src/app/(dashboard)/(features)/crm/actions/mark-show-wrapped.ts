'use server';

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { z } from 'zod/v4';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { instrument } from '@/shared/lib/instrumentation';
import { publishDomainEvent } from '@/shared/lib/domain-events/publish-domain-event';

/**
 * Show-wrap transitions for ops.events — Pass 3 Phase 4 canonical writer.
 *
 * The "Wrap" action is the deliberate close-out moment a PM asked for in the
 * User Advocate research pass: "I want to stamp it DONE and have it leave my
 * desk." It is NOT the same as markShowEnded — ending a show is a runtime
 * transition, wrapping is a business/admin transition.
 *
 * Column pair + archive flag written:
 *   - `status` = 'archived'
 *   - `lifecycle_status` = 'archived'     (Phase 0 trigger requires the pair)
 *   - `archived_at` = now()               (Phase 4 column — the active filter)
 *
 * Reversible for 72 hours via `undoMarkShowWrapped` — User Advocate explicitly
 * asked for this ("something always comes up"). After 72h, the wrap is final
 * and requires manual DB intervention to undo.
 *
 * What this action does NOT do (out of Phase 4 scope — deferred to later passes):
 *   - Generate a post-show PDF report (Field Expert's Cvent analog)
 *   - Require a checklist gate (User Advocate's worst-way warning)
 *   - Freeze crew hours for payroll export
 *   - Prompt for thank-you email / next-inquiry nudge (Follow-Up Engine)
 *
 * The Follow-Up Engine will subscribe to the 'show.wrapped' domain event once
 * its queue tables exist (currently design-doc only).
 */

const EventIdSchema = z.string().uuid();
const UNDO_WINDOW_MS = 72 * 60 * 60 * 1000; // 72 hours

export type WrapShowResult =
  | { success: true; eventId: string; archivedAt: string }
  | { success: false; error: string };

/**
 * Mark an event as wrapped. Canonical writer pattern: updates all three
 * columns in one statement (status / lifecycle_status / archived_at),
 * publishes `show.wrapped` to ops.domain_events, revalidates the paths
 * where the event could still be visible.
 *
 * Idempotent: calling Wrap on an already-wrapped event is a no-op success.
 */
export async function markShowWrapped(eventId: string): Promise<WrapShowResult> {
  return instrument('markShowWrapped', async () => {
    const parsed = EventIdSchema.safeParse(eventId);
    if (!parsed.success) return { success: false, error: 'Invalid event id.' };

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchErr } = await (supabase as any)
      .schema('ops')
      .from('events')
      .select('id, status, archived_at')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (fetchErr) return { success: false, error: fetchErr.message };
    if (!existing) return { success: false, error: 'Event not found.' };

    const row = existing as { id: string; status: string | null; archived_at: string | null };
    if (row.status === 'archived' && row.archived_at) {
      // Already wrapped — idempotent success.
      return { success: true, eventId, archivedAt: row.archived_at };
    }

    const archivedAt = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase as any)
      .schema('ops')
      .from('events')
      .update({
        status: 'archived',
        lifecycle_status: 'archived',
        archived_at: archivedAt,
      })
      .eq('id', eventId)
      .eq('workspace_id', workspaceId);

    if (updateErr) {
      Sentry.logger.error('crm.markShowWrapped.updateFailed', {
        eventId,
        workspaceId,
        error: updateErr.message,
      });
      return { success: false, error: updateErr.message };
    }

    // Publish the domain event seam. Never throws. See
    // src/shared/lib/domain-events/publish-domain-event.ts contract.
    await publishDomainEvent({
      workspaceId,
      eventId,
      type: 'show.wrapped',
      payload: { wrappedAt: archivedAt },
    });

    // Revalidate every surface that might still be displaying the event.
    revalidatePath('/crm');
    revalidatePath('/');
    revalidatePath('/client/event');
    revalidatePath('/client/songs');

    return { success: true, eventId, archivedAt };
  });
}

/**
 * Undo a Wrap within 72 hours. Reverts status/lifecycle to 'post', clears
 * archived_at. After 72h, this refuses and the PM must re-open via manual
 * workspace admin action.
 *
 * Does NOT publish a compensating domain event — the 'show.wrapped' row
 * becomes historical but stays in ops.domain_events. Downstream consumers
 * (when they exist) must handle the "wrapped then unwrapped" case. Today
 * there are no consumers.
 */
export async function undoMarkShowWrapped(eventId: string): Promise<WrapShowResult> {
  return instrument('undoMarkShowWrapped', async () => {
    const parsed = EventIdSchema.safeParse(eventId);
    if (!parsed.success) return { success: false, error: 'Invalid event id.' };

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return { success: false, error: 'No active workspace.' };

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing, error: fetchErr } = await (supabase as any)
      .schema('ops')
      .from('events')
      .select('id, status, archived_at, show_ended_at')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (fetchErr) return { success: false, error: fetchErr.message };
    if (!existing) return { success: false, error: 'Event not found.' };

    const row = existing as {
      id: string;
      status: string | null;
      archived_at: string | null;
      show_ended_at: string | null;
    };

    if (row.status !== 'archived' || !row.archived_at) {
      return { success: false, error: 'Show is not currently wrapped.' };
    }

    const archivedAtMs = Date.parse(row.archived_at);
    if (Number.isNaN(archivedAtMs)) {
      return { success: false, error: 'Wrap timestamp is invalid — cannot undo.' };
    }

    if (Date.now() - archivedAtMs > UNDO_WINDOW_MS) {
      return { success: false, error: 'Wrap is older than 72 hours — undo is no longer available.' };
    }

    // Revert to the pre-wrap state. If the show had been marked ended
    // (show_ended_at set), revert to status='completed'/lifecycle='post'.
    // Otherwise revert to status='in_progress'/lifecycle='live' (rare —
    // would mean the PM wrapped a still-running show by mistake).
    const nextStatus = row.show_ended_at ? 'completed' : 'in_progress';
    const nextLifecycle = row.show_ended_at ? 'post' : 'live';

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: updateErr } = await (supabase as any)
      .schema('ops')
      .from('events')
      .update({
        status: nextStatus,
        lifecycle_status: nextLifecycle,
        archived_at: null,
      })
      .eq('id', eventId)
      .eq('workspace_id', workspaceId);

    if (updateErr) {
      Sentry.logger.error('crm.undoMarkShowWrapped.updateFailed', {
        eventId,
        workspaceId,
        error: updateErr.message,
      });
      return { success: false, error: updateErr.message };
    }

    revalidatePath('/crm');
    revalidatePath('/');
    revalidatePath('/client/event');
    revalidatePath('/client/songs');

    return { success: true, eventId, archivedAt: row.archived_at };
  });
}
