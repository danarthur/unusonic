/**
 * Show dates — when we last worked with someone, and when we next will.
 *
 * The contacts page could say what someone's tier was, how complete their
 * profile was, and when the row was created, but not whether they can work
 * Saturday. That is the question the page is actually opened to answer, so
 * these two dates are the standing signal every card is built around.
 *
 * Two routes, because the answer lives in different tables depending on the
 * edge:
 *   • roster and freelancers  → ops.deal_crew (they were crewed on the show)
 *   • partners, venues, clients → ops.deal_stakeholders + deals.organization_id
 *
 * Date precedence is deliberate. ops.events.starts_at is a real scheduled show;
 * deals.proposed_date is a date somebody typed into a pipeline record. Both are
 * usable, they are not equally true, and `nextConfirmed` keeps them
 * distinguishable so the card can say "booked Sat" rather than implying a
 * proposal is a booking.
 *
 * Everything here is batched. Resolving this per card would be four round
 * trips times two hundred cards.
 */

import type { NetworkNode } from '@/entities/network';

export type ShowDates = {
  /** Most recent show already worked. ISO date, or null if there is no history. */
  lastWorked: string | null;
  /** Next show ahead. ISO date, or null if nothing is on the books. */
  nextBooked: string | null;
  /** Whether `nextBooked` is a scheduled event rather than a proposed deal date. */
  nextConfirmed: boolean;
};

/** One dated point of contact, before it is reduced to last/next. */
export type DatePoint = { date: string; confirmed: boolean };

/**
 * PostgREST puts `.in()` lists in the query string, so an unbounded id list
 * becomes an unbounded URL. Deals accumulate without limit; entities do not.
 */
const CHUNK = 200;

function chunked<T>(items: T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += CHUNK) out.push(items.slice(i, i + CHUNK));
  return out;
}

/** Flatten `data` off a set of settled PostgREST responses. */
function rowsOf<T>(results: { data: T[] | null }[]): T[] {
  return results.flatMap((r) => r.data ?? []);
}

function addDeal(map: Map<string, Set<string>>, entityId: string | null, dealId: string | null) {
  if (!entityId || !dealId) return;
  const existing = map.get(entityId);
  if (existing) existing.add(dealId);
  else map.set(entityId, new Set([dealId]));
}

/**
 * Which deals each entity took part in.
 *
 * Four routes rather than one join: a person can reach a deal by being crewed
 * on it, by being named on it, or by working for the company named on it, and
 * a company can reach it by being the client. Missing any one of these is how
 * an entity ends up showing zero history despite having worked repeatedly.
 */
async function fetchDealsByEntity(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- cross-schema row shape resolves at runtime; narrowing here would duplicate the generated types.
  supabase: any,
  workspaceId: string,
  entityIds: string[],
): Promise<Map<string, Set<string>>> {
  const batches = chunked(entityIds);

  const [crew, byPerson, byOrg, asClient] = await Promise.all([
    Promise.all(batches.map((ids) =>
      supabase.schema('ops').from('deal_crew')
        .select('entity_id, deal_id')
        .in('entity_id', ids)
        .eq('workspace_id', workspaceId)
        // A declined offer is not a show worked.
        .is('declined_at', null))),
    Promise.all(batches.map((ids) =>
      supabase.schema('ops').from('deal_stakeholders')
        .select('entity_id, deal_id')
        .in('entity_id', ids))),
    Promise.all(batches.map((ids) =>
      supabase.schema('ops').from('deal_stakeholders')
        .select('organization_id, deal_id')
        .in('organization_id', ids))),
    Promise.all(batches.map((ids) =>
      supabase.from('deals')
        .select('id, organization_id')
        .in('organization_id', ids))),
  ]);

  const byEntity = new Map<string, Set<string>>();

  for (const r of rowsOf<{ entity_id: string | null; deal_id: string | null }>([...crew, ...byPerson])) {
    addDeal(byEntity, r.entity_id, r.deal_id);
  }
  for (const r of rowsOf<{ organization_id: string | null; deal_id: string | null }>(byOrg)) {
    addDeal(byEntity, r.organization_id, r.deal_id);
  }
  for (const r of rowsOf<{ id: string; organization_id: string | null }>(asClient)) {
    addDeal(byEntity, r.organization_id, r.id);
  }

  return byEntity;
}

/**
 * When each deal actually happens.
 *
 * A deal can carry several events; each is its own date, because working three
 * nights of a residency is three shows and the middle one should not vanish.
 */
async function fetchDatesByDeal(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above.
  supabase: any,
  dealIds: string[],
): Promise<Map<string, DatePoint[]>> {
  const batches = chunked(dealIds);

  const [events, deals] = await Promise.all([
    Promise.all(batches.map((ids) =>
      supabase.schema('ops').from('events')
        .select('deal_id, starts_at')
        .in('deal_id', ids))),
    Promise.all(batches.map((ids) =>
      supabase.from('deals')
        .select('id, proposed_date')
        .in('id', ids))),
  ]);

  const byDeal = new Map<string, DatePoint[]>();

  for (const r of rowsOf<{ deal_id: string | null; starts_at: string }>(events)) {
    if (!r.deal_id || !r.starts_at) continue;
    const existing = byDeal.get(r.deal_id);
    const point: DatePoint = { date: r.starts_at, confirmed: true };
    if (existing) existing.push(point);
    else byDeal.set(r.deal_id, [point]);
  }

  // Proposed dates are a fallback, not an addition: once a deal is handed off
  // and has real events, its pipeline date is a stale guess about the same show.
  for (const r of rowsOf<{ id: string; proposed_date: string | null }>(deals)) {
    if (!r.proposed_date || byDeal.has(r.id)) continue;
    byDeal.set(r.id, [{ date: r.proposed_date, confirmed: false }]);
  }

  return byDeal;
}

function earliest(points: DatePoint[]): DatePoint | null {
  return points.reduce<DatePoint | null>((best, p) => (!best || p.date < best.date ? p : best), null);
}

function latest(points: DatePoint[]): DatePoint | null {
  return points.reduce<DatePoint | null>((best, p) => (!best || p.date > best.date ? p : best), null);
}

/** Reduce one entity's date points to the pair the card renders. Exported for tests. */
export function reduceToShowDates(points: DatePoint[], nowIso: string): ShowDates {
  const last = latest(points.filter((p) => p.date <= nowIso));
  const next = earliest(points.filter((p) => p.date > nowIso));

  return {
    lastWorked: last?.date ?? null,
    nextBooked: next?.date ?? null,
    nextConfirmed: next?.confirmed ?? false,
  };
}

/**
 * Attach last-worked and next-booked to every node.
 *
 * Returns the nodes unchanged on any failure — a card missing its date reads
 * as a quiet gap, while a contacts page that failed to load does not.
 */
export async function attachShowDates(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- see above.
  supabase: any,
  workspaceId: string,
  nodes: NetworkNode[],
): Promise<NetworkNode[]> {
  const entityIds = [...new Set(nodes.map((n) => n.entityId).filter(Boolean))];
  if (entityIds.length === 0) return nodes;

  const dealsByEntity = await fetchDealsByEntity(supabase, workspaceId, entityIds);

  const allDealIds = [...new Set([...dealsByEntity.values()].flatMap((s) => [...s]))];
  if (allDealIds.length === 0) return nodes;

  const datesByDeal = await fetchDatesByDeal(supabase, allDealIds);
  const nowIso = new Date().toISOString();

  return nodes.map((node) => {
    const dealIds = dealsByEntity.get(node.entityId);
    if (!dealIds) return node;

    const points = [...dealIds].flatMap((id) => datesByDeal.get(id) ?? []);
    if (points.length === 0) return node;

    const { lastWorked, nextBooked, nextConfirmed } = reduceToShowDates(points, nowIso);
    return { ...node, meta: { ...node.meta, lastWorked, nextBooked, nextConfirmed } };
  });
}
