'use server';

import { createClient } from '@/shared/api/supabase/server';

export type SyncCrewRatesResult = {
  /** True when deal_crew had zero rows with an assigned entity — caller can surface a "no crew" warning. */
  emptySource: boolean;
  inserted: number;
  updated: number;
};

/**
 * Syncs deal_crew day_rate values to crew_assignments at handoff.
 * For each deal_crew row with an entity_id, checks if a matching
 * crew_assignments row exists for (event_id, entity_id).
 * - If yes: updates pay_rate only if currently null.
 * - If no: inserts a new crew_assignments row.
 *
 * Non-blocking — catches all errors and logs them. Returns a summary so
 * the handover can tell the PM "no crew was synced" instead of leaving
 * them with a silently empty Plan tab crew grid.
 */
export async function syncCrewRatesToAssignments(
  eventId: string,
  dealId: string
): Promise<SyncCrewRatesResult> {
  const empty: SyncCrewRatesResult = { emptySource: true, inserted: 0, updated: 0 };
  try {
    // Guard against callers that invoke this before the ops.events row exists.
    // Without this, the function would still insert crew_assignments rows —
    // but their event_id FK would fail or orphan on rollback.
    if (!eventId || !dealId) {
      console.warn('[handoff] sync-crew-rates skipped: missing eventId or dealId', {
        eventId,
        dealId,
      });
      return empty;
    }

    const supabase = await createClient();

    // 1. Get deal_crew rows with assigned entities
    const { data: crewRows, error: crewErr } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('id, entity_id, role_note, day_rate, confirmed_at')
      .eq('deal_id', dealId)
      .not('entity_id', 'is', null);

    if (crewErr) {
      console.error('[handoff] sync-crew-rates query deal_crew:', crewErr.message);
      return empty;
    }

    if (!crewRows || crewRows.length === 0) return empty;

    // 2. Get the workspace_id from the event
    const { data: event, error: eventErr } = await supabase
      .schema('ops')
      .from('events')
      .select('workspace_id')
      .eq('id', eventId)
      .single();

    if (eventErr || !event) {
      console.error('[handoff] sync-crew-rates query event:', eventErr?.message ?? 'event not found');
      return { emptySource: false, inserted: 0, updated: 0 };
    }

    const workspaceId = (event as { workspace_id: string }).workspace_id;

    // 3. Get existing crew_assignments for this event.
    // Pass 3 Phase 1: ALSO read `status` so re-running the sync does not
    // downgrade a portal-confirmed row back to 'requested'. The original
    // handoff path INSERTs with `dc.confirmed_at ? 'confirmed' : 'requested'`
    // which is still correct for fresh inserts, but on re-run we must
    // respect any portal confirmations that arrived between handoff and now.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existingAssignments } = await supabase
      .schema('ops')
      .from('crew_assignments')
      .select('id, entity_id, pay_rate, status')
      .eq('event_id', eventId);

    const existingByEntity = new Map<
      string,
      { id: string; pay_rate: number | null; status: string | null }
    >();
    for (const a of existingAssignments ?? []) {
      const row = a as {
        id: string;
        entity_id: string;
        pay_rate: number | null;
        status: string | null;
      };
      if (row.entity_id) {
        existingByEntity.set(row.entity_id, {
          id: row.id,
          pay_rate: row.pay_rate,
          status: row.status,
        });
      }
    }

    // 4. Get max sort_order for inserts
    const { data: maxRow } = await supabase
      .schema('ops')
      .from('crew_assignments')
      .select('sort_order')
      .eq('event_id', eventId)
      .order('sort_order', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nextSort = ((maxRow as { sort_order?: number } | null)?.sort_order ?? -1) + 1;
    let inserted = 0;
    let updated = 0;

    // 5. Process each deal_crew row
    for (const raw of crewRows) {
      const dc = raw as {
        id: string;
        entity_id: string;
        role_note: string | null;
        day_rate: number | null;
        confirmed_at: string | null;
      };

      const existing = existingByEntity.get(dc.entity_id);

      if (existing) {
        // Update pay_rate only if currently null
        if (existing.pay_rate == null && dc.day_rate != null) {
          await supabase
            .schema('ops')
            .from('crew_assignments')
            .update({ pay_rate: dc.day_rate, pay_rate_type: 'flat' })
            .eq('id', existing.id);
          updated++;
        }
      } else {
        // Insert a new crew_assignments row.
        // Status decision: if deal_crew has confirmed_at, the row carries a
        // confirmed booking through to the portal. The Pass 3 Phase 1 drift
        // trigger on crew_assignments requires deal_crew.confirmed_at to
        // already be set for status='confirmed' writes, which is true by
        // construction here (we just read `dc.confirmed_at` from the source).
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase
          .schema('ops')
          .from('crew_assignments')
          .insert({
            event_id: eventId,
            workspace_id: workspaceId,
            entity_id: dc.entity_id,
            role: dc.role_note,
            pay_rate: dc.day_rate,
            pay_rate_type: 'flat',
            status: dc.confirmed_at ? 'confirmed' : 'requested',
            sort_order: nextSort,
            booking_type: 'labor',
            source_package_id: null,
            quantity_index: 0,
            scheduled_hours: null,
          });
        nextSort++;
        inserted++;
      }
    }
    return { emptySource: false, inserted, updated };
  } catch (err) {
    console.error('[handoff] sync-crew-rates unexpected error:', err);
    return { emptySource: false, inserted: 0, updated: 0 };
  }
}
