'use server';

/**
 * Crew status-transition actions (LASSO state machine).
 *
 * Extracted from crew-hub.ts (Phase 0.5-style split, 2026-04-29). Owns:
 *   - replaceCrewMember: swap one assigned crew row for another person.
 */

import { z } from 'zod/v4';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// replaceCrewMember — swap one assigned crew row for another person.
//
// LASSO state machine semantics: the original row flips to status='replaced'
// (history preserved) and a new row is inserted with status='offered' for
// the same role + department + catalog linkage + call_time. Both movements
// land in crew_comms_log so the Crew Hub activity feed reflects the swap.
// =============================================================================

const ReplaceCrewSchema = z.object({
  dealCrewId: z.string().uuid(),
  newEntityId: z.string().uuid(),
});

export async function replaceCrewMember(input: {
  dealCrewId: string;
  newEntityId: string;
}): Promise<
  | { success: true; newDealCrewId: string }
  | { success: false; error: string }
> {
  const parsed = ReplaceCrewSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const actorUserId = user?.id ?? null;

    // 1. Load the row we're replacing. Pull only the fields we need to clone
    // plus confirmed_at for rollback-state handling.
    const { data: original, error: originalErr } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('id, deal_id, workspace_id, role_note, source, catalog_item_id, department, call_time, call_time_slot_id, day_rate, entity_id, confirmed_at')
      .eq('id', parsed.data.dealCrewId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (originalErr || !original) {
      return { success: false, error: 'Original crew row not found.' };
    }
    if (!original.entity_id) {
      // Replacing an open slot is really just assignment — caller should use
      // assignDealCrewEntity for that flow.
      return { success: false, error: 'Row has no assignee to replace. Use assign instead.' };
    }
    if (original.entity_id === parsed.data.newEntityId) {
      return { success: false, error: 'Same person — no swap needed.' };
    }

    // 2. Resolve the event_id for log + audit context.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: evt } = await supabase
      .schema('ops')
      .from('events')
      .select('id')
      .eq('deal_id', original.deal_id)
      .maybeSingle();
    const eventId = (evt?.id as string) ?? null;

    // 3. Mark original row replaced. Preserve confirmed_at/declined_at history;
    //    we only change status so ordering filters stay sensible.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: markErr } = await supabase
      .schema('ops')
      .from('deal_crew')
      .update({ status: 'replaced' })
      .eq('id', parsed.data.dealCrewId)
      .eq('workspace_id', workspaceId);

    if (markErr) {
      return { success: false, error: markErr.message };
    }

    // 4. Insert the replacement row. Unique index on (deal_id, entity_id) will
    //    reject if the new person is already on this deal — we catch that and
    //    translate to a useful error instead of a raw Postgres message.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertErr } = await supabase
      .schema('ops')
      .from('deal_crew')
      .insert({
        deal_id: original.deal_id,
        workspace_id: original.workspace_id,
        entity_id: parsed.data.newEntityId,
        role_note: original.role_note,
        source: original.source,
        catalog_item_id: original.catalog_item_id,
        department: original.department,
        call_time: original.call_time,
        call_time_slot_id: original.call_time_slot_id,
        day_rate: original.day_rate,
        status: 'offered',
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      // Try to roll the original back so the UI doesn't end up with a dangling
      // 'replaced' row and no replacement. Best-effort: if the rollback also
      // fails the PM will see the replaced status and can manually recover.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await supabase
        .schema('ops')
        .from('deal_crew')
        .update({ status: original.entity_id ? (original.confirmed_at ? 'confirmed' : 'pending') : 'pending' })
        .eq('id', parsed.data.dealCrewId)
        .eq('workspace_id', workspaceId);
      const isDupe = insertErr?.message?.includes('deal_crew_deal_entity_uniq');
      return {
        success: false,
        error: isDupe
          ? 'That person is already on this deal.'
          : (insertErr?.message ?? 'Insert failed'),
      };
    }

    const newDealCrewId = (inserted as { id: string }).id;

    // 5. Log both sides of the swap so the Crew Hub activity feed tells the
    //    story from either angle. Failures here are non-fatal.
    const nowIso = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await supabase
      .schema('ops')
      .from('crew_comms_log')
      .insert([
        {
          workspace_id: workspaceId,
          deal_crew_id: parsed.data.dealCrewId,
          event_id: eventId,
          channel: 'system',
          event_type: 'status_changed',
          occurred_at: nowIso,
          actor_user_id: actorUserId,
          summary: 'Replaced by PM',
          payload: { new_entity_id: parsed.data.newEntityId, new_deal_crew_id: newDealCrewId },
        },
        {
          workspace_id: workspaceId,
          deal_crew_id: newDealCrewId,
          event_id: eventId,
          channel: 'system',
          event_type: 'status_changed',
          occurred_at: nowIso,
          actor_user_id: actorUserId,
          summary: 'Added as replacement',
          payload: { replaces_deal_crew_id: parsed.data.dealCrewId, replaces_entity_id: original.entity_id },
        },
      ]);

    return { success: true, newDealCrewId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'replaceCrewMember' } });
    return { success: false, error: message };
  }
}
