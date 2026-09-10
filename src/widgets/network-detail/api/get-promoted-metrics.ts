/**
 * getPromotedMetrics — the two metrics that earn inline placement on the
 * entity header, per design doc §4.1, §10.2:
 *
 *   Person:  "Shows: 12" + "Last contact: 3d ago"
 *   Company: "Team: 5"   + "Deals: 12 open / 34 past"
 *
 * Each metric is computed from existing tables — no schema work needed.
 * See network-page-ia-redesign.md §10 for the "why only two metrics" rationale.
 */

'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';
import { AFFILIATION_RELATIONSHIP_TYPES } from '@/entities/network/model/affiliation';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { readRate, type PersonRate } from '@/entities/directory/model/read-rate';
import { getEntityProductions } from './get-entity-productions';
import { wasWorked } from './entity-productions-shape';

export type PersonMetrics = {
  kind: 'person';
  showCount: number;
  /**
   * The last show worked together, named.
   *
   * The name is not decoration. Memory here is show-shaped -- not "we worked
   * together in June" but "the Hale wedding" -- so the title is the retrieval
   * key, and it is how you tell a real record from an invented one.
   *
   * Replaces a "last contact" derived from the most recent capture, which
   * measured when someone was last talked ABOUT rather than last worked with.
   */
  lastShow: { title: string | null; date: string | null } | null;
  /**
   * The next show already booked, named.
   *
   * The strip could say when someone was last out but not when they are next,
   * which is the question actually asked before picking up the phone. Booked
   * only: a proposal in play is not a show you have, and promising one would be
   * the kind of confident wrong statement this strip exists to avoid.
   */
  nextShow: { title: string | null; date: string | null } | null;
  /** What they cost, so the staffing question is answered on one line. */
  rate: PersonRate | null;
};

export type CompanyMetrics = {
  kind: 'company';
  teamCount: number;
  openDealsCount: number;
  pastDealsCount: number;
};

export type VenueMetrics = {
  kind: 'venue';
  showsHostedCount: number;
  lastContactAt: string | null;
};

export type PromotedMetrics = PersonMetrics | CompanyMetrics | VenueMetrics;

export type GetPromotedMetricsResult =
  | { ok: true; metrics: PromotedMetrics }
  | { ok: false; error: string };


// Open = live deals in progress (pre-terminal).
// Past = terminal (won = closed business, lost = dead).
const DEAL_OPEN = [
  'inquiry', 'proposal', 'contract_sent',
  'contract_signed', 'deposit_received',
];
const DEAL_PAST = ['won', 'lost'];

export async function getPromotedMetrics(
  workspaceId: string,
  entityId: string,
  entityType: 'person' | 'company' | 'venue' | 'couple',
): Promise<GetPromotedMetricsResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Unauthorized.' };

  if (entityType === 'person' || entityType === 'couple') {
    return getPersonMetrics(supabase, workspaceId, entityId);
  }
  if (entityType === 'venue') {
    return getVenueMetrics(supabase, workspaceId, entityId);
  }
  return getCompanyMetrics(supabase, workspaceId, entityId);
}

// ── Person ───────────────────────────────────────────────────────────────────
async function getPersonMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  entityId: string,
): Promise<GetPromotedMetricsResult> {
  // Counted by the canonical productions reader, not by ops.deal_crew rows.
  // Crew rows only see people who were CREWED on a show, so a coordinator --
  // who is a stakeholder and never crew -- read as zero shows in the header
  // while the productions list directly below it showed several.
  const [productions, entityRow] = await Promise.all([
    getEntityProductions(workspaceId, entityId),
    supabase
      .schema('directory')
      .from('entities')
      .select('attributes')
      .eq('id', entityId)
      .maybeSingle(),
  ]);

  if (!productions.ok) return { ok: false, error: productions.error };

  // Worked, not merely past. The past band also holds proposals that went
  // quiet, and counting those would inflate "12 shows" with work that never
  // happened.
  const worked = productions.productions.filter(wasWorked);
  // Already sorted newest first by the reader.
  const last = worked[0] ?? null;

  // Signed and still ahead. The reader sorts newest first, so the soonest
  // booked show is the last of them.
  const booked = productions.productions.filter((p) => p.band === 'booked' && p.date);
  const next = booked.length > 0 ? booked[booked.length - 1] : null;

  const attrs = readEntityAttrs(
    (entityRow.data as { attributes: unknown } | null)?.attributes,
    'person',
  );

  return {
    ok: true,
    metrics: {
      kind: 'person',
      showCount: worked.length,
      lastShow: last ? { title: last.title, date: last.date } : null,
      nextShow: next ? { title: next.title, date: next.date } : null,
      rate: readRate(attrs as unknown as Record<string, unknown>),
    },
  };
}

// ── Venue ────────────────────────────────────────────────────────────────────

async function getVenueMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  entityId: string,
): Promise<GetPromotedMetricsResult> {
  // Shows hosted: count of ops.events where venue_entity_id = this venue.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count: showsCount } = await supabase
    .schema('ops')
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('venue_entity_id', entityId);

  // Last contact: latest capture about this venue.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastCapture } = await supabase
    .schema('cortex')
    .from('capture_events')
    .select('created_at')
    .eq('workspace_id', workspaceId)
    .eq('resolved_entity_id', entityId)
    .eq('status', 'confirmed')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  return {
    ok: true,
    metrics: {
      kind: 'venue',
      showsHostedCount: (showsCount as number | null) ?? 0,
      lastContactAt:
        (lastCapture as { created_at: string } | null)?.created_at ?? null,
    },
  };
}

// ── Company ──────────────────────────────────────────────────────────────────

async function getCompanyMetrics(
  supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  entityId: string,
): Promise<GetPromotedMetricsResult> {
  // Team count: distinct affiliated people via cortex.relationships.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: edgeRows } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, target_entity_id')
    .in('relationship_type', AFFILIATION_RELATIONSHIP_TYPES)
    // Live affiliations only; ended edges are history (see affiliation.ts).
    .is('ended_at', null)
    .or(`source_entity_id.eq.${entityId},target_entity_id.eq.${entityId}`);

  const teamIds = new Set<string>();
  for (const r of ((edgeRows ?? []) as { source_entity_id: string; target_entity_id: string }[])) {
    if (r.source_entity_id !== entityId) teamIds.add(r.source_entity_id);
    if (r.target_entity_id !== entityId) teamIds.add(r.target_entity_id);
  }
  // Filter to people / couples only.
  let teamCount = 0;
  if (teamIds.size > 0) {
    const { data: peopleRows } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, type')
      .in('id', Array.from(teamIds))
      .in('type', ['person', 'couple']);
    teamCount = (peopleRows ?? []).length;
  }

  // Deals: open (pre-won) vs past (won/lost). Counted by any deal where the
  // company is client_organization OR a stakeholder's organization is the
  // company. Keep it to the direct organization_id path for simplicity —
  // stakeholder-org joins add noise here and the value of the metric is a
  // glance, not a precise rollup.
  const [{ count: openCount }, { count: pastCount }] = await Promise.all([
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('organization_id', entityId)
      .in('status', DEAL_OPEN),
    supabase
      .from('deals')
      .select('id', { count: 'exact', head: true })
      .eq('workspace_id', workspaceId)
      .eq('organization_id', entityId)
      .in('status', DEAL_PAST),
  ]);

  return {
    ok: true,
    metrics: {
      kind: 'company',
      teamCount,
      openDealsCount: (openCount as number | null) ?? 0,
      pastDealsCount: (pastCount as number | null) ?? 0,
    },
  };
}
