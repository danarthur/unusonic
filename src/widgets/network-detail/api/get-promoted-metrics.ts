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
import { getPersonRelationshipStats } from './get-person-relationship-stats';

export type PersonMetrics = {
  kind: 'person';
  showCount: number;
  lastContactAt: string | null;
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

const AFFILIATION_RELATIONSHIP_TYPES = [
  'MEMBER',
  'ROSTER_MEMBER',
  'PARTNER',
  'EMPLOYEE',
  'WORKS_FOR',
  'EMPLOYED_AT',
  'AGENT',
];

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
  _supabase: Awaited<ReturnType<typeof createClient>>,
  workspaceId: string,
  entityId: string,
): Promise<GetPromotedMetricsResult> {
  // Delegates to the shared fetcher so this row can never silently drift from
  // the Person Stats card or the dormant_client evaluator.
  // docs/reference/person-stats-card-design.md §5.1, §7.
  const result = await getPersonRelationshipStats(workspaceId, entityId);
  if (!result.ok) return { ok: false, error: result.error };
  return {
    ok: true,
    metrics: {
      kind: 'person',
      showCount: result.stats.showsCountAllTime,
      lastContactAt: result.stats.lastContactAt,
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
  const { count: showsCount } = await (supabase as any)
    .schema('ops')
    .from('events')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .eq('venue_entity_id', entityId);

  // Last contact: latest capture about this venue.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: lastCapture } = await (supabase as any)
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
  const { data: edgeRows } = await (supabase as any)
    .schema('cortex')
    .from('relationships')
    .select('source_entity_id, target_entity_id')
    .in('relationship_type', AFFILIATION_RELATIONSHIP_TYPES)
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
