'use server';

import 'server-only';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { instrument } from '@/shared/lib/instrumentation';

export type CrewResponseResult = { ok: true } | { ok: false; error: string };

/**
 * Crew member confirms or declines an assignment from the portal.
 * Validates that the assignment belongs to the authenticated user's person entity.
 *
 * Pass 3 Phase 1: MUST mirror the decision into the partner `ops.deal_crew` row
 * before updating `crew_assignments.status`. The Phase 1 drift trigger
 * (`crew_assignments_confirmation_drift`) rejects `status='confirmed'` writes
 * when the partner `deal_crew` row is missing or has NULL `confirmed_at`, so
 * the mirror must happen first. If the partner row doesn't exist (orphaned
 * assignment), we surface an explicit error instead of hitting the trigger.
 */
export async function respondToCrewAssignment(
  assignmentId: string,
  response: 'confirmed' | 'declined',
): Promise<CrewResponseResult> {
  return instrument('respondToCrewAssignment', async () => {
    if (!assignmentId) return { ok: false, error: 'Missing assignment ID.' };

    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { ok: false, error: 'Not authenticated.' };

    // Resolve the user's person entity
    const { data: person } = await supabase
      .schema('directory')
      .from('entities')
      .select('id')
      .eq('claimed_by_user_id', user.id)
      .eq('type', 'person')
      .maybeSingle();

    if (!person) return { ok: false, error: 'No linked profile.' };

    // Fetch assignment and verify ownership + read event_id so we can find the
    // partner deal_crew row.
    const { data: assignment } = await supabase
      .schema('ops')
      .from('crew_assignments')
      .select('id, entity_id, event_id, status')
      .eq('id', assignmentId)
      .maybeSingle();

    if (!assignment) return { ok: false, error: 'Assignment not found.' };
    if (assignment.entity_id !== person.id) return { ok: false, error: 'Not your assignment.' };
    if (assignment.status !== 'requested') return { ok: false, error: 'Already responded.' };

    const eventId = assignment.event_id as string;
    const nowIso = new Date().toISOString();

    // Resolve event.deal_id so we can find the partner deal_crew row.
    // Use (supabase as any) casts for ops schema reads (see CLAUDE.md D2 drift).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: eventRow } = await (supabase as any)
      .schema('ops')
      .from('events')
      .select('deal_id')
      .eq('id', eventId)
      .maybeSingle();

    const dealId = (eventRow as { deal_id?: string | null } | null)?.deal_id ?? null;
    if (!dealId) {
      Sentry.logger.error('crew.respondToCrewAssignment.eventHasNoDeal', {
        assignmentId,
        eventId,
        entityId: person.id,
      });
      return { ok: false, error: 'Event is missing a deal reference — contact your PM.' };
    }

    // Mirror the decision into deal_crew FIRST. The drift trigger on
    // crew_assignments requires this row to be up to date when we update the
    // portal side. If the row doesn't exist, this is an orphan assignment and
    // we must bail out before the trigger fires.
    const mirrorPatch =
      response === 'confirmed'
        ? { confirmed_at: nowIso, declined_at: null }
        : { confirmed_at: null, declined_at: nowIso };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: mirrorResult, error: mirrorErr } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .update(mirrorPatch)
      .eq('deal_id', dealId)
      .eq('entity_id', person.id)
      .select('id');

    if (mirrorErr) {
      Sentry.logger.error('crew.respondToCrewAssignment.mirrorFailed', {
        assignmentId,
        eventId,
        dealId,
        entityId: person.id,
        response,
        error: mirrorErr.message,
      });
      return { ok: false, error: 'Failed to update confirmation.' };
    }

    const mirroredRows = Array.isArray(mirrorResult) ? mirrorResult.length : 0;
    if (mirroredRows === 0) {
      // Orphan case: no partner deal_crew row exists. The Phase 1 trigger would
      // reject the crew_assignments update anyway — surface a clearer error here.
      Sentry.logger.warn('crew.respondToCrewAssignment.orphanAssignment', {
        assignmentId,
        eventId,
        dealId,
        entityId: person.id,
      });
      return {
        ok: false,
        error: 'This assignment is orphaned. Please ask your PM to re-add you via the Production Team Card.',
      };
    }

    // Mirror succeeded — now update the portal-side status row.
    const { error } = await supabase
      .schema('ops')
      .from('crew_assignments')
      .update({
        status: response,
        status_updated_at: nowIso,
        status_updated_by: user.id,
      })
      .eq('id', assignmentId);

    if (error) {
      Sentry.logger.error('crew.respondToCrewAssignment.portalUpdateFailed', {
        assignmentId,
        eventId,
        dealId,
        entityId: person.id,
        response,
        error: error.message,
      });
      return { ok: false, error: 'Failed to update.' };
    }

    return { ok: true };
  });
}
