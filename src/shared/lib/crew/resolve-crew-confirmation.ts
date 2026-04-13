import 'server-only';

import type { createClient } from '@/shared/api/supabase/server';

/**
 * Crew confirmation resolver — Pass 3 Phase 1.
 *
 * Why this exists:
 *   `ops.deal_crew.confirmed_at` and `ops.crew_assignments.status` are two
 *   parallel confirmation tracks. Pre-handoff, the Plan lens writes
 *   `deal_crew.confirmed_at`. Post-handoff, the Employee Portal writes
 *   `crew_assignments.status='confirmed'` via `respondToCrewAssignment`.
 *   They drift unless mirrored at write time.
 *
 *   Pass 3 Phase 1 fixes the write side (portal now mirrors to deal_crew;
 *   a DB trigger enforces the invariant). This module fixes the READ side:
 *   every consumer that cares about "is this crew member confirmed" goes
 *   through the resolver and gets the freshest truth, regardless of which
 *   table was actually written to last.
 *
 * Canonical read path:
 *   - `resolveCrewConfirmation(supabase, eventId, entityId)` for single lookups
 *   - `resolveCrewConfirmationBatch(supabase, eventId, entityIds)` for Plan lens
 *     / ReadinessRibbon / Aion tools that need many entities at once.
 *
 *   Both return the newest non-null confirmed_at between:
 *     - `deal_crew.confirmed_at` (found via event.deal_id + entity_id)
 *     - `crew_assignments.status_updated_at` where status = 'confirmed'
 *       (found via event_id + entity_id)
 *
 *   `source` on the returned state indicates which side won. `'none'` means
 *   neither side has a confirmation yet.
 *
 * Pre-handoff usage: the resolver tolerates eventIds that don't resolve to a
 * deal (rare but possible) and returns `'none'`. Callers that only have a
 * dealId should not use this module — they should read `deal_crew.confirmed_at`
 * directly, because there are no `crew_assignments` rows yet. The overlay in
 * `getDealCrew` guards with an event-lookup before calling the batch resolver.
 *
 * Do NOT add decline tracking here beyond what the portal already writes.
 * Declines are single-source today: `deal_crew.declined_at` from the Plan
 * lens pre-handoff, `crew_assignments.status='declined'` from the portal
 * post-handoff. The resolver treats declines symmetrically with confirms.
 */

type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

export type CrewConfirmationSource = 'deal_crew' | 'portal' | 'none';

export type CrewConfirmationState = {
  /** Newest non-null confirmed_at from either source, or null. */
  confirmedAt: string | null;
  /** Newest non-null declined_at from either source, or null. Portal declines use status_updated_at. */
  declinedAt: string | null;
  /** Which source the confirmed_at came from. 'none' when confirmedAt is null. */
  source: CrewConfirmationSource;
};

const EMPTY_STATE: CrewConfirmationState = {
  confirmedAt: null,
  declinedAt: null,
  source: 'none',
};

/** Pick the newest of two ISO timestamps, allowing nulls. */
function freshest(a: string | null, b: string | null): string | null {
  if (a && b) return a > b ? a : b;
  return a ?? b;
}

/**
 * Single-entity resolver. Cheap; uses two small queries. Prefer the batch
 * variant when you have more than one entity_id.
 */
export async function resolveCrewConfirmation(
  supabase: ServerSupabase,
  eventId: string,
  entityId: string,
): Promise<CrewConfirmationState> {
  const batch = await resolveCrewConfirmationBatch(supabase, eventId, [entityId]);
  return batch.get(entityId) ?? EMPTY_STATE;
}

/**
 * Batch resolver — one lookup per table, then merge in JS. Returns a Map
 * keyed by entity_id so callers can zip it onto their existing crew rows.
 *
 * Missing entities (not found in either table) are NOT present in the map.
 * Callers should use `map.get(id) ?? EMPTY_STATE` for safety.
 */
export async function resolveCrewConfirmationBatch(
  supabase: ServerSupabase,
  eventId: string,
  entityIds: string[],
): Promise<Map<string, CrewConfirmationState>> {
  const result = new Map<string, CrewConfirmationState>();
  if (entityIds.length === 0) return result;

  // De-dupe the input; callers sometimes hand us the same entity multiple times.
  const uniqueIds = Array.from(new Set(entityIds));

  // 1) Lookup event.deal_id so we can join deal_crew by (deal_id, entity_id).
  //    The resolver is called from post-handoff paths; if eventId doesn't
  //    resolve to a deal, we gracefully return empty states.
  //    Uses `supabase.schema('ops')` because ops types are not
  //    generated (see CLAUDE.md D2 drift).
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: eventRow } = await supabase
    .schema('ops')
    .from('events')
    .select('deal_id')
    .eq('id', eventId)
    .maybeSingle();

  const dealId = (eventRow as { deal_id?: string | null } | null)?.deal_id ?? null;

  // 2) Portal side: crew_assignments rows for this event.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: portalRows } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('entity_id, status, status_updated_at')
    .eq('event_id', eventId)
    .in('entity_id', uniqueIds);

  type PortalRow = {
    entity_id: string | null;
    status: string | null;
    status_updated_at: string | null;
  };
  const portalRowsTyped = (portalRows ?? []) as PortalRow[];

  // 3) Deal crew side: one query if we resolved deal_id, otherwise skip.
  type DcRow = {
    entity_id: string | null;
    confirmed_at: string | null;
    declined_at: string | null;
  };
  let dealCrewRows: DcRow[] = [];
  if (dealId) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: dcData } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('entity_id, confirmed_at, declined_at')
      .eq('deal_id', dealId)
      .in('entity_id', uniqueIds);
    dealCrewRows = (dcData ?? []) as DcRow[];
  }

  // Merge into the result map, picking the freshest non-null per entity.
  for (const id of uniqueIds) {
    const dc = dealCrewRows.find((r) => r.entity_id === id) ?? null;
    const portal = portalRowsTyped.find((r) => r.entity_id === id) ?? null;

    const dcConfirmed = dc?.confirmed_at ?? null;
    const dcDeclined = dc?.declined_at ?? null;
    const portalConfirmed = portal?.status === 'confirmed' ? portal.status_updated_at : null;
    const portalDeclined = portal?.status === 'declined' ? portal.status_updated_at : null;

    const mergedConfirmed = freshest(dcConfirmed, portalConfirmed);
    const mergedDeclined = freshest(dcDeclined, portalDeclined);

    let source: CrewConfirmationSource = 'none';
    if (mergedConfirmed) {
      // Which side's confirmed_at won? Ties go to deal_crew (the older canonical source).
      if (dcConfirmed && portalConfirmed) {
        source = dcConfirmed >= portalConfirmed ? 'deal_crew' : 'portal';
      } else if (dcConfirmed) {
        source = 'deal_crew';
      } else {
        source = 'portal';
      }
    }

    result.set(id, {
      confirmedAt: mergedConfirmed,
      declinedAt: mergedDeclined,
      source,
    });
  }

  return result;
}

/**
 * Cross-deal resolver — used by the CRM stream readiness ribbon, which needs
 * aggregated "confirmed crew count" per deal across many deals at once.
 *
 * Input: a list of { dealId, eventId } pairs. Output: a Map<dealId, Map<entityId, state>>
 * that overlays portal (ops.crew_assignments) confirmations on top of the raw
 * `ops.deal_crew` rows, picking the freshest non-null for each.
 *
 * Use this over direct `deal_crew.confirmed_at` reads whenever portal
 * confirmations might have landed but not yet mirrored to deal_crew.
 */
export async function resolveCrewConfirmationForDeals(
  supabase: ServerSupabase,
  pairs: { dealId: string; eventId: string }[],
): Promise<Map<string, Map<string, CrewConfirmationState>>> {
  const result = new Map<string, Map<string, CrewConfirmationState>>();
  if (pairs.length === 0) return result;

  const dealIds = Array.from(new Set(pairs.map((p) => p.dealId)));
  const eventIds = Array.from(new Set(pairs.map((p) => p.eventId)));
  const eventIdToDealId = new Map(pairs.map((p) => [p.eventId, p.dealId]));

  // 1) Deal-crew rows across all deals.
  type DcRow = {
    deal_id: string;
    entity_id: string | null;
    confirmed_at: string | null;
    declined_at: string | null;
  };
  const { data: dcData } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('deal_id, entity_id, confirmed_at, declined_at')
    .in('deal_id', dealIds);
  const dealCrewRows = (dcData ?? []) as DcRow[];

  // 2) Portal assignments across all events.
  type PortalRow = {
    event_id: string;
    entity_id: string | null;
    status: string | null;
    status_updated_at: string | null;
  };
  const { data: portalData } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('event_id, entity_id, status, status_updated_at')
    .in('event_id', eventIds);
  const portalRows = (portalData ?? []) as PortalRow[];

  // Group portal rows by deal_id (via event→deal map).
  const portalByDeal = new Map<string, PortalRow[]>();
  for (const p of portalRows) {
    const dealId = eventIdToDealId.get(p.event_id);
    if (!dealId) continue;
    const arr = portalByDeal.get(dealId) ?? [];
    arr.push(p);
    portalByDeal.set(dealId, arr);
  }

  // Collect all entity_ids per deal from both sides.
  const entityIdsByDeal = new Map<string, Set<string>>();
  for (const r of dealCrewRows) {
    if (!r.entity_id) continue;
    const set = entityIdsByDeal.get(r.deal_id) ?? new Set();
    set.add(r.entity_id);
    entityIdsByDeal.set(r.deal_id, set);
  }
  for (const [dealId, rows] of portalByDeal) {
    const set = entityIdsByDeal.get(dealId) ?? new Set();
    for (const r of rows) if (r.entity_id) set.add(r.entity_id);
    entityIdsByDeal.set(dealId, set);
  }

  // Merge per deal, per entity.
  for (const [dealId, entityIdSet] of entityIdsByDeal) {
    const perDeal = new Map<string, CrewConfirmationState>();
    for (const entityId of entityIdSet) {
      const dc = dealCrewRows.find((r) => r.deal_id === dealId && r.entity_id === entityId) ?? null;
      const portal = (portalByDeal.get(dealId) ?? []).find((r) => r.entity_id === entityId) ?? null;

      const dcConfirmed = dc?.confirmed_at ?? null;
      const dcDeclined = dc?.declined_at ?? null;
      const portalConfirmed = portal?.status === 'confirmed' ? portal.status_updated_at : null;
      const portalDeclined = portal?.status === 'declined' ? portal.status_updated_at : null;

      const mergedConfirmed = freshest(dcConfirmed, portalConfirmed);
      const mergedDeclined = freshest(dcDeclined, portalDeclined);

      let source: CrewConfirmationSource = 'none';
      if (mergedConfirmed) {
        if (dcConfirmed && portalConfirmed) {
          source = dcConfirmed >= portalConfirmed ? 'deal_crew' : 'portal';
        } else if (dcConfirmed) {
          source = 'deal_crew';
        } else {
          source = 'portal';
        }
      }

      perDeal.set(entityId, {
        confirmedAt: mergedConfirmed,
        declinedAt: mergedDeclined,
        source,
      });
    }
    result.set(dealId, perDeal);
  }

  return result;
}
