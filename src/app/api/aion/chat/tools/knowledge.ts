/**
 * Knowledge retrieval + analytics tools.
 * All read-only — no confirmation required.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { getDeal } from '@/app/(dashboard)/(features)/crm/actions/get-deal';
import { getDealClientContext } from '@/app/(dashboard)/(features)/crm/actions/get-deal-client';
import { getDealCrew } from '@/app/(dashboard)/(features)/crm/actions/deal-crew';
import { getProposalForDeal } from '@/features/sales/api/proposal-actions';
import { checkCrewAvailability } from '@/features/ops/actions/check-crew-availability';
import { getEntityCrewSchedule } from '@/features/ops/actions/get-entity-crew-schedule';
import { getEntityDeals, getEntityFinancialSummary } from '@/features/network-data/api/entity-context-actions';
import { getCalendarEvents } from '@/features/calendar/api/get-events';
import { toIONContext } from '@/shared/lib/entity-attrs';
import { getDealPipeline } from '@/widgets/dashboard/api/get-deal-pipeline';
import { getFinancialPulse } from '@/widgets/dashboard/api/get-financial-pulse';
import { getClientConcentration } from '@/widgets/dashboard/api/get-client-concentration';
import { getRevenueTrend } from '@/widgets/dashboard/api/get-revenue-trend';
import { searchMemory, type SourceType } from '../../lib/embeddings';
import { wrapUntrusted } from '../../lib/wrap-untrusted';
import { envelope } from '../../lib/retrieval-envelope';
import { getSubstrateCounts } from '../../lib/substrate-counts';
import type { AionToolContext } from './types';

// ---------------------------------------------------------------------------
// Pure helpers — extracted from `lookup_historical_deals` so they can be
// unit-tested without mocking the supabase chain. See §3.1 of the Phase 2
// plan for the scoring rubric and payload caps.
// ---------------------------------------------------------------------------

export type HistoricalDealCandidate = {
  id: string;
  title: string | null;
  status: string | null;
  proposed_date: string | null;
  event_archetype: string | null;
  venue_id: string | null;
  organization_id: string | null;
  event_id: string | null;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
};

export type HistoricalDealSourceContext = {
  event_archetype: string | null;
  venue_id: string | null;
  proposed_date: string | null;
  guest_count_expected: number | null;
};

/**
 * Score a candidate deal against a source deal using four structural factors:
 * event archetype, venue, month-of-year (±1 month, circular), headcount (±25%).
 * Each factor contributes 1 point — max score 4. Headcount is only scored when
 * both source and candidate have an event-linked headcount.
 */
export function scoreStructuralSimilarity(
  source: HistoricalDealSourceContext,
  candidate: HistoricalDealCandidate,
  candidateGuestCount: number | null,
): number {
  let score = 0;
  if (source.event_archetype && candidate.event_archetype && source.event_archetype === candidate.event_archetype) {
    score += 1;
  }
  if (source.venue_id && candidate.venue_id && source.venue_id === candidate.venue_id) {
    score += 1;
  }
  if (source.proposed_date && candidate.proposed_date) {
    const sm = new Date(source.proposed_date).getUTCMonth();
    const cm = new Date(candidate.proposed_date).getUTCMonth();
    const diff = Math.min(Math.abs(sm - cm), 12 - Math.abs(sm - cm));
    if (diff <= 1) score += 1;
  }
  if (source.guest_count_expected != null && candidateGuestCount != null && source.guest_count_expected > 0) {
    const delta = Math.abs(candidateGuestCount - source.guest_count_expected) / source.guest_count_expected;
    if (delta <= 0.25) score += 1;
  }
  return score;
}

/**
 * Cap a string to `n` characters, adding a trailing ellipsis when truncated.
 * Returns null when the input is null/empty to preserve field-absence semantics.
 */
export function capString(s: string | null, n: number): string | null {
  if (s == null) return null;
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + '…';
}

/**
 * Extract meaningful search tokens from a free-text query. Drops stop words
 * and very short tokens, caps at 4, and returns an array of lowercase tokens
 * usable for building an AND-chain of ILIKE patterns.
 *
 * Why: literal ILIKE fails on "Ally Emily" against title "Ally & Emily Wedding"
 * because the `&` is between the tokens. Token-AND matching fires three
 * independent `ILIKE '%token%'` constraints which `chainEq(title)` combines
 * as AND — so any token arrangement matches.
 */
const STOP_WORDS = new Set([
  'a', 'an', 'the', 'for', 'of', 'in', 'on', 'at', 'by', 'to', 'from', 'with',
  'and', 'or', 'but', 'is', 'was', 'are', 'were', 'be', 'been', 'being',
  'what', 'which', 'who', 'whom', 'whose', 'where', 'when', 'why', 'how',
  'did', 'do', 'does', 'done', 'doing', 'has', 'have', 'had', 'having',
  'we', 'us', 'our', 'ours', 'you', 'your', 'yours', 'i', 'me', 'my', 'mine',
  'they', 'them', 'their', 'theirs', 'this', 'that', 'these', 'those',
  'much', 'many', 'some', 'any', 'all', 'each', 'every',
  'quote', 'quoted', 'charge', 'charged', 'pay', 'paid', 'cost', 'costs',
  'price', 'pricing', 'priced', 'total',
]);

export function extractSearchTokens(query: string): string[] {
  return query
    .toLowerCase()
    .split(/[\s,.!?]+/)
    .map((t) => t.trim())
    .filter((t) => t.length >= 2 && !STOP_WORDS.has(t))
    .slice(0, 4); // cap so a run-on sentence doesn't AND to zero
}

/** Escape `%` and `_` in a token so it's a literal ILIKE match. */
export function toIlikePattern(token: string): string {
  return `%${token.replace(/[%_]/g, '\\$&')}%`;
}

// ---------------------------------------------------------------------------
// lookup_historical_deals helpers — private to this module.
// Each helper covers one phase of the tool's flow so the main `execute`
// stays under the repo's cognitive-complexity ceiling.
// ---------------------------------------------------------------------------

type AuthedClient = Awaited<ReturnType<typeof createClient>>;

type DealRow = {
  id: string;
  title: string | null;
  status: string | null;
  proposed_date: string | null;
  event_archetype: string | null;
  venue_id: string | null;
  organization_id: string | null;
  /** Nullable — weddings often have an individual contact (Ally / Emily)
   *  rather than a company. Used by the union-query client filter. */
  main_contact_id: string | null;
  event_id: string | null;
  won_at: string | null;
  lost_at: string | null;
  created_at: string;
};

type CandidateFilters = {
  limit: number;
  hasSimilarity: boolean;
  excludeDealId?: string;
  /** Directory entity ids matched from either explicit id or fuzzy name query.
   *  Used to filter deals by organization_id OR main_contact_id. */
  clientEntityIds: string[];
  /** Raw fuzzy query — applied as a deal-title ILIKE fallback so wedding-style
   *  deals (title on the DEAL, not the client entity) still surface. */
  clientNameQuery?: string;
  filters?: {
    date_range?: [string, string];
    status?: 'won' | 'lost' | 'any';
    min_value?: number;
    max_value?: number;
    venue_entity_id?: string;
  };
};

/**
 * Resolve directory entity ids that match the caller's intent. Returns the
 * explicit id as a singleton, fuzzy-matched ids for a name query, or an empty
 * array when no entity matches (which is NOT a dead end — the caller falls
 * back to a deal-title ILIKE so wedding-style deals still surface).
 *
 * Post-"Ally & Emily" fix (Sprint 3 polish): an empty list no longer
 * short-circuits to an empty result — the candidate fetch will still try the
 * deal-title match before giving up.
 */
async function resolveClientEntityIds(
  supabase: AuthedClient,
  workspaceId: string,
  clientEntityId: string | undefined,
  clientNameQuery: string | undefined,
): Promise<string[]> {
  if (clientEntityId) return [clientEntityId];
  if (!clientNameQuery) return [];

  const tokens = extractSearchTokens(clientNameQuery);
  if (tokens.length === 0) return [];

  // Chain .ilike() per token so all tokens must appear SOMEWHERE in the
  // display name. Avoids the "Ally Emily" ≠ "Ally & Emily" literal failure.
  let q = supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('owner_workspace_id', workspaceId)
    .in('type', ['organization', 'client', 'company', 'person'])
    .limit(20);
  for (const token of tokens) {
    q = q.ilike('display_name', toIlikePattern(token));
  }
  const { data } = await q;
  return ((data ?? []) as { id: string }[]).map((e) => e.id);
}

/**
 * Pull the four structural fields of the source deal used to score candidates.
 * Source must be in the caller's workspace — `.eq('workspace_id', ...)` is the
 * cross-workspace probe defence (Critic §Risk 2).
 */
async function fetchSimilarityContext(
  supabase: AuthedClient,
  workspaceId: string,
  sourceDealId: string,
): Promise<HistoricalDealSourceContext | null> {
  const { data: srcDeal } = await supabase
    .from('deals')
    .select('event_archetype, venue_id, proposed_date, event_id')
    .eq('id', sourceDealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!srcDeal) return null;
  const src = srcDeal as { event_archetype: string | null; venue_id: string | null; proposed_date: string | null; event_id: string | null };

  let guestCount: number | null = null;
  if (src.event_id) {
    const { data: ev } = await supabase
      .schema('ops')
      .from('events')
      .select('guest_count_expected, guest_count_actual')
      .eq('id', src.event_id)
      .maybeSingle();
    if (ev) guestCount = ev.guest_count_actual ?? ev.guest_count_expected ?? null;
  }

  return {
    event_archetype: src.event_archetype,
    venue_id: src.venue_id,
    proposed_date: src.proposed_date,
    guest_count_expected: guestCount,
  };
}

async function fetchCandidateDeals(
  supabase: AuthedClient,
  workspaceId: string,
  spec: CandidateFilters,
): Promise<DealRow[] | null> {
  const SELECT = 'id, title, status, proposed_date, event_archetype, venue_id, organization_id, main_contact_id, event_id, won_at, lost_at, created_at';
  const perQueryLimit = spec.hasSimilarity ? 40 : Math.min(spec.limit + 5, 20);

  // Re-usable base filter applier. Every union branch must carry the same
  // workspace scope + shared filters — this prevents accidentally dropping
  // e.g. `status='won'` on the title-match branch.
  // `any` here matches the repo-wide pattern for building Supabase chains;
  // the Supabase types are too recursive for a clean generic signature.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const applyBase = (q: any) => {
    let acc = q
      .eq('workspace_id', workspaceId)
      .is('archived_at', null)
      .order('proposed_date', { ascending: false })
      .limit(perQueryLimit);
    if (spec.excludeDealId) acc = acc.neq('id', spec.excludeDealId);
    const f = spec.filters;
    if (f?.status && f.status !== 'any') acc = acc.eq('status', f.status);
    if (f?.date_range) acc = acc.gte('proposed_date', f.date_range[0]).lte('proposed_date', f.date_range[1]);
    if (f?.venue_entity_id) acc = acc.eq('venue_id', f.venue_entity_id);
    return acc;
  };

  const hasIds = spec.clientEntityIds.length > 0;
  const hasQuery = !!spec.clientNameQuery?.trim();

  // No client filter at all → return recent deals in the workspace. Similarity
  // re-ranks them downstream when `similar_to_deal_id` is set.
  if (!hasIds && !hasQuery) {
    const { data, error } = await applyBase(supabase.from('deals').select(SELECT));
    if (error) return null;
    return (data ?? []) as DealRow[];
  }

  // Union: run up to 3 queries in parallel and dedupe by id. This is the
  // "Ally & Emily" fix — a wedding deal with an individual client won't
  // surface via `organization_id`, but the title match catches it. PostgREST
  // `.or()` with ILIKE is fragile for values containing commas / parens, so
  // we split the union server-side instead.
  const queries: Array<Promise<{ data: DealRow[] | null; error: unknown }>> = [];

  if (hasIds) {
    queries.push(
      applyBase(supabase.from('deals').select(SELECT))
        .in('organization_id', spec.clientEntityIds),
    );
    queries.push(
      applyBase(supabase.from('deals').select(SELECT))
        .in('main_contact_id', spec.clientEntityIds),
    );
  }
  if (hasQuery) {
    // Token-AND title match: "Ally Emily" → ILIKE %Ally% AND ILIKE %Emily%
    // catches the title "Ally & Emily Wedding" even though the raw query
    // string misses the `&`.
    const tokens = extractSearchTokens(spec.clientNameQuery!);
    if (tokens.length > 0) {
      let titleQ = applyBase(supabase.from('deals').select(SELECT));
      for (const token of tokens) {
        titleQ = titleQ.ilike('title', toIlikePattern(token));
      }
      queries.push(titleQ);
    }
  }

  const results = await Promise.all(queries);

  // Dedupe by id, keep newest-first ordering by proposed_date.
  const seen = new Map<string, DealRow>();
  for (const r of results) {
    if (r.error) continue;
    for (const row of (r.data ?? []) as DealRow[]) {
      if (!seen.has(row.id)) seen.set(row.id, row);
    }
  }
  return [...seen.values()].sort((a, b) =>
    (b.proposed_date ?? '').localeCompare(a.proposed_date ?? ''),
  );
}

/**
 * Batch-load headcount for a set of event ids. Uses `guest_count_actual` when
 * available (post-show truth), else `guest_count_expected`.
 */
async function fetchGuestCounts(supabase: AuthedClient, eventIds: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (eventIds.length === 0) return out;
  const { data } = await supabase
    .schema('ops')
    .from('events')
    .select('id, guest_count_expected, guest_count_actual')
    .in('id', eventIds);
  for (const ev of data ?? []) {
    const hc = ev.guest_count_actual ?? ev.guest_count_expected;
    if (hc != null) out.set(ev.id, hc);
  }
  return out;
}

/**
 * Compute final_accepted_total + headline line-item per deal. Prefers an
 * accepted proposal; falls back to the max-total non-draft proposal. Uses the
 * same formula the app uses elsewhere: `(override_price ?? unit_price) * quantity`.
 */
async function computeDealTotals(
  supabase: AuthedClient,
  dealIds: string[],
): Promise<Map<string, { total: number; headline: string | null }>> {
  const out = new Map<string, { total: number; headline: string | null }>();
  if (dealIds.length === 0) return out;

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id, status, accepted_at')
    .in('deal_id', dealIds)
    .neq('status', 'draft');
  const proposalRows = (proposals ?? []) as { id: string; deal_id: string; status: string; accepted_at: string | null }[];
  if (proposalRows.length === 0) return out;

  const { data: items } = await supabase
    .from('proposal_items')
    .select('proposal_id, name, quantity, unit_price, override_price')
    .in('proposal_id', proposalRows.map((p) => p.id))
    .eq('is_client_visible', true);

  const totalsByProposal = new Map<string, number>();
  const topLineByProposal = new Map<string, { name: string; amount: number }>();
  for (const it of (items ?? []) as { proposal_id: string; name: string | null; quantity: number; unit_price: number | null; override_price: number | null }[]) {
    const price = (it.override_price ?? it.unit_price) ?? 0;
    const line = price * (it.quantity ?? 1);
    totalsByProposal.set(it.proposal_id, (totalsByProposal.get(it.proposal_id) ?? 0) + line);
    if (it.name) {
      const current = topLineByProposal.get(it.proposal_id);
      if (!current || line > current.amount) {
        topLineByProposal.set(it.proposal_id, { name: it.name, amount: line });
      }
    }
  }

  const byDeal = new Map<string, { id: string; total: number; accepted: boolean }>();
  for (const p of proposalRows) {
    const total = totalsByProposal.get(p.id) ?? 0;
    const accepted = Boolean(p.accepted_at);
    const prev = byDeal.get(p.deal_id);
    if (!prev || (accepted && !prev.accepted) || (accepted === prev.accepted && total > prev.total)) {
      byDeal.set(p.deal_id, { id: p.id, total, accepted });
    }
  }
  for (const [dealId, pick] of byDeal) {
    out.set(dealId, { total: pick.total, headline: topLineByProposal.get(pick.id)?.name ?? null });
  }
  return out;
}

async function fetchClientNames(
  supabase: AuthedClient,
  workspaceId: string,
  orgIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const unique = [...new Set(orgIds)];
  if (unique.length === 0) return out;
  const { data } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name')
    .in('id', unique)
    .eq('owner_workspace_id', workspaceId);
  for (const e of (data ?? []) as { id: string; display_name: string | null }[]) {
    if (e.display_name) out.set(e.id, e.display_name);
  }
  return out;
}

export function createKnowledgeTools(ctx: AionToolContext) {
  const { workspaceId, pageContext } = ctx;

  /** Resolve a deal ID — use explicit param, fall back to page context */
  const resolveDealId = (explicit?: string): string | null =>
    explicit || (pageContext?.type === 'deal' || pageContext?.type === 'proposal' ? pageContext.entityId : null);

  /** Resolve an entity ID — use explicit param, fall back to page context */
  const resolveEntityId = (explicit?: string): string | null =>
    explicit || (pageContext?.type === 'entity' ? pageContext.entityId : null);

  // ---- Entity search & details ----

  const search_entities = tool({
    description: 'Search for people, companies, or venues by name.',
    inputSchema: z.object({
      query: z.string().describe('Name to search for'),
      type: z.enum(['person', 'organization', 'venue', 'all']).optional().describe('Filter by entity type. Default: all'),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      const pattern = `%${params.query}%`;
      const typeFilter = params.type === 'all' || !params.type ? undefined
        : params.type === 'organization' ? ['organization', 'client', 'company'] : [params.type];

      let q = supabase.schema('directory').from('entities')
        .select('id, type, display_name, attributes')
        .eq('owner_workspace_id', workspaceId).ilike('display_name', pattern)
        .order('display_name').limit(8);
      if (typeFilter) q = q.in('type', typeFilter);

      const { data } = await q;
      const results = (data ?? []).map((e: any) => {
        const ctxType = e.type === 'organization' || e.type === 'client' || e.type === 'company' ? 'company' : e.type;
        return { id: e.id, type: e.type, name: e.display_name, ...toIONContext(e.attributes, ctxType) };
      });
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(results, searched, {
        reason: results.length === 0 ? 'no_matching_entities' : 'has_data',
      });
    },
  });

  const get_entity_details = tool({
    description: 'Get full details for a specific entity by ID. Returns contact info, attributes, relationships, deals, invoices. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'entity_not_found', hint: 'No entity ID provided and no entity in view.' });
      }
      const supabase = await createClient();
      const { data: entity } = await supabase.schema('directory').from('entities')
        .select('id, type, display_name, attributes, avatar_url, claimed_by_user_id')
        .eq('id', entityId).eq('owner_workspace_id', workspaceId).maybeSingle();
      if (!entity) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'entity_not_found' });
      }

      const entityType = (entity as any).type;
      const ctxType = entityType === 'organization' || entityType === 'client' || entityType === 'company' ? 'company' : entityType;
      const attrs = toIONContext((entity as any).attributes, ctxType);

      const { data: rels } = await supabase.schema('cortex').from('relationships')
        .select('id, relationship_type, target_entity_id, context_data')
        .eq('source_entity_id', entityId).is('context_data->deleted_at', null).limit(5);

      const relationships = [];
      if (rels?.length) {
        const targetIds = (rels as any[]).map((r: any) => r.target_entity_id);
        const { data: targets } = await supabase.schema('directory').from('entities')
          .select('id, display_name, type').in('id', targetIds);
        const targetMap = new Map((targets ?? []).map((t: any) => [t.id, t]));
        for (const rel of rels as any[]) {
          const target = targetMap.get(rel.target_entity_id);
          relationships.push({
            type: rel.relationship_type, targetName: target?.display_name ?? 'Unknown',
            targetType: target?.type ?? 'unknown', tier: rel.context_data?.tier,
          });
        }
      }

      const deals = await getEntityDeals(entityId);
      const invoices = await getEntityFinancialSummary(entityId);
      const searched = await getSubstrateCounts(workspaceId);

      return envelope({
        id: (entity as any).id, name: (entity as any).display_name, type: entityType,
        isGhost: !(entity as any).claimed_by_user_id, attributes: attrs,
        relationships, deals: deals.slice(0, 5), openInvoices: invoices,
      }, searched);
    },
  });

  // ---- Deal details ----

  const get_deal_details = tool({
    description: 'Get full details for a deal including client, proposal, and crew. If no dealId provided, uses the deal the user is currently viewing.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found', hint: 'No deal ID provided and no deal in view.' });
      }
      const deal = await getDeal(dealId);
      if (!deal) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found' });
      }
      const client = await getDealClientContext(dealId);
      const proposal = await getProposalForDeal(dealId);
      const crew = await getDealCrew(dealId);
      const searched = await getSubstrateCounts(workspaceId);

      return envelope({
        deal: { id: deal.id, title: deal.title, status: deal.status, eventDate: deal.proposed_date, eventType: deal.event_archetype, budget: deal.budget_estimated, notes: deal.notes, showHealth: deal.show_health },
        client: client ? { name: client.organization.name, contactName: client.mainContact ? `${client.mainContact.first_name} ${client.mainContact.last_name}` : null, email: client.mainContact?.email ?? client.organization.support_email, phone: client.mainContact?.phone } : null,
        proposal: proposal ? { status: proposal.status, total: proposal.items?.reduce((sum: number, i: any) => sum + (i.total ?? 0), 0) ?? 0, itemCount: proposal.items?.length ?? 0, viewCount: proposal.view_count, lastViewed: proposal.last_viewed_at } : null,
        crew: crew.slice(0, 10).map((c) => ({ name: c.entity_name, role: c.role_note, confirmed: !!c.confirmed_at, dispatchStatus: c.dispatch_status })),
        crewTotal: crew.length,
      }, searched);
    },
  });

  const get_deal_crew = tool({
    description: 'Get the crew roster for a deal. If no dealId provided, uses the deal the user is currently viewing.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'deal_not_found', hint: 'No deal ID provided and no deal in view.' });
      }
      const crew = await getDealCrew(dealId);
      const searched = await getSubstrateCounts(workspaceId);
      const rows = crew.slice(0, 15).map((c) => ({ entityId: c.entity_id, name: c.entity_name, role: c.role_note, department: c.department, confirmed: !!c.confirmed_at, dispatchStatus: c.dispatch_status, callTime: c.call_time, dayRate: c.day_rate }));
      return envelope(rows, searched, {
        reason: rows.length === 0 ? 'no_crew_on_deal' : 'has_data',
      });
    },
  });

  const get_deal_signals = tool({
    description:
      'Get the per-deal signal stack — observable facts about the deal that a production owner would weigh: deposit status, proposal engagement (hot lead, cooling, unopened), event date pressure, repeat-client status, ownership gap. ' +
      'These are the same signals shown on the Signals card in the CRM, so your read of the deal will match what the user sees. ' +
      'Each signal includes a label, a concrete value, polarity (positive/negative/neutral), severity (high/medium/low), and a natural-language sentence you can quote. ' +
      'Use this when the user asks "how is this deal doing?", "is this one going to close?", or "what should I worry about?" — narrate the signals in prose; never report a percentage.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the deal the user is currently viewing.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'deal_not_found', hint: 'No deal ID provided and no deal in view.' });
      }
      const { getDealSignals } = await import('@/app/(dashboard)/(features)/crm/actions/get-deal-signals');
      const signals = await getDealSignals(dealId);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(signals, searched, {
        reason: signals.length === 0 ? 'no_signals_to_report' : 'has_data',
        hint: signals.length === 0
          ? 'Deal exists but no observable signals fired — narrate that plainly. Do NOT invent buy signals.'
          : 'Quote the `sentence` field verbatim or paraphrase tightly. Never aggregate the signals into a probability or score.',
      });
    },
  });

  const get_proposal_details = tool({
    description: 'Get proposal details for a deal including line items, status, totals. If no dealId provided, uses the deal the user is currently viewing.',
    inputSchema: z.object({ dealId: z.string().optional().describe('The deal ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const dealId = resolveDealId(params.dealId);
      if (!dealId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'deal_not_found', hint: 'No deal ID provided and no deal in view.' });
      }
      const proposal = await getProposalForDeal(dealId);
      if (!proposal) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'no_proposal_on_deal' });
      }
      const searched = await getSubstrateCounts(workspaceId);
      return envelope({
        id: proposal.id, status: proposal.status,
        total: proposal.items?.reduce((sum: number, i: any) => sum + (i.total ?? 0), 0) ?? 0,
        viewCount: proposal.view_count, lastViewed: proposal.last_viewed_at, acceptedAt: proposal.accepted_at,
        items: (proposal.items ?? []).slice(0, 15).map((i: any) => ({ name: i.name ?? i.label, quantity: i.quantity, unitPrice: i.unit_price, total: i.total, category: i.category })),
      }, searched);
    },
  });

  // ---- Crew schedule & availability ----

  const check_crew_availability_tool = tool({
    description: 'Check if a crew member is available on a specific date.',
    inputSchema: z.object({
      entityId: z.string().describe('The crew member entity ID'),
      date: z.string().describe('The date to check in YYYY-MM-DD format'),
    }),
    execute: async (params) => {
      const availability = await checkCrewAvailability(params.entityId, params.date);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(availability, searched);
    },
  });

  const get_entity_schedule = tool({
    description: 'Get upcoming shows and assignments for a crew member. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The crew member entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'entity_not_found', hint: 'No entity ID provided and no entity in view.' });
      }
      const schedule = await getEntityCrewSchedule(entityId);
      const searched = await getSubstrateCounts(workspaceId);
      const upcoming = schedule.slice(0, 10).map((e) => ({ eventTitle: e.event_title, role: e.role, status: e.status, startsAt: e.starts_at, endsAt: e.ends_at, venueName: e.venue_name, dealId: e.deal_id }));
      return envelope(upcoming, searched, {
        reason: upcoming.length === 0 ? 'no_upcoming_shows' : 'has_data',
      });
    },
  });

  const get_calendar_events = tool({
    description: 'Get events in a date range.',
    inputSchema: z.object({
      start: z.string().describe('Start date in YYYY-MM-DD format'),
      end: z.string().describe('End date in YYYY-MM-DD format'),
    }),
    execute: async (params) => {
      const events = await getCalendarEvents({ start: params.start, end: params.end, workspaceId });
      const searched = await getSubstrateCounts(workspaceId);
      const rows = events.slice(0, 15).map((e) => ({ id: e.id, title: e.title, start: e.start, end: e.end, status: e.status, location: e.location, clientName: e.clientName }));
      return envelope(rows, searched, {
        reason: rows.length === 0 ? 'no_activity_in_window' : 'has_data',
      });
    },
  });

  const get_entity_financial_summary = tool({
    description: 'Get open invoices and deal history for an entity. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'entity_not_found', hint: 'No entity ID provided and no entity in view.' });
      }
      const [invoices, deals] = await Promise.all([getEntityFinancialSummary(entityId), getEntityDeals(entityId)]);
      const searched = await getSubstrateCounts(workspaceId);
      const hasData = invoices.length > 0 || deals.length > 0;
      return envelope({
        openInvoices: invoices, totalOutstanding: invoices.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0),
        deals: deals.slice(0, 10).map((d) => ({ id: d.id, eventType: d.event_archetype, status: d.status, date: d.proposed_date, budget: d.budget_estimated })),
      }, searched, {
        reason: !hasData ? 'no_open_invoices' : 'has_data',
      });
    },
  });

  // ---- Analytics ----

  const get_pipeline_summary = tool({
    description: 'Get the deal pipeline summary: deals by stage, counts, values.',
    inputSchema: z.object({}),
    execute: async () => {
      const pipeline = await getDealPipeline();
      // Cap stage details to keep token budget reasonable
      if (pipeline.stages) {
        for (const stage of pipeline.stages as any[]) {
          if (stage.deals?.length > 10) stage.deals = stage.deals.slice(0, 10);
        }
      }
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(pipeline, searched, {
        reason: searched.deals === 0 ? 'no_closed_deals_yet' : 'has_data',
      });
    },
  });

  const get_revenue_summary = tool({
    description: 'Get revenue and financial health: this month vs last month, outstanding, overdue.',
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getFinancialPulse();
      const searched = await getSubstrateCounts(workspaceId);
      return envelope({ revenueThisMonth: data.revenueThisMonth, revenueLastMonth: data.revenueLastMonth, revenueDelta: data.revenueDelta, outstandingTotal: data.outstandingTotal, outstandingCount: data.outstandingCount, overdueTotal: data.overdueTotal, overdueCount: data.overdueCount }, searched, {
        reason: searched.deals === 0 ? 'no_closed_deals_yet' : 'has_data',
      });
    },
  });

  const get_client_concentration = tool({
    description: 'Get top clients by revenue with percentage of total.',
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getClientConcentration();
      // Cap to top 8 clients to keep token budget reasonable
      if (data.clients?.length > 8) data.clients = data.clients.slice(0, 8);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(data, searched, {
        reason: (data.clients?.length ?? 0) === 0 ? 'no_closed_deals_yet' : 'has_data',
      });
    },
  });

  const get_revenue_trend = tool({
    description: 'Get monthly revenue trend for the last 6 months. Returns data for a line chart.',
    inputSchema: z.object({}),
    execute: async () => {
      const data = await getRevenueTrend();
      const searched = await getSubstrateCounts(workspaceId);
      return envelope({ months: data.months }, searched, {
        reason: searched.deals === 0 ? 'no_closed_deals_yet' : 'has_data',
      });
    },
  });

  const get_client_insights = tool({
    description: 'Get comprehensive insights about a client: deal history, win rate, average deal size, outstanding balance. If no entityId provided, uses the entity the user is currently viewing.',
    inputSchema: z.object({ entityId: z.string().optional().describe('The client entity ID. Omit to use the current page context.') }),
    execute: async (params) => {
      const entityId = resolveEntityId(params.entityId);
      if (!entityId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'entity_not_found', hint: 'No entity ID provided and no entity in view.' });
      }
      const [deals, invoices] = await Promise.all([getEntityDeals(entityId), getEntityFinancialSummary(entityId)]);
      const wonDeals = deals.filter((d) => d.status === 'won');
      const totalBudget = deals.reduce((sum, d) => sum + (d.budget_estimated ?? 0), 0);
      const outstandingBalance = invoices.reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope({
        totalDeals: deals.length, wonDeals: wonDeals.length,
        winRate: deals.length > 0 ? Math.round((wonDeals.length / deals.length) * 100) : 0,
        avgDealSize: deals.length > 0 ? Math.round(totalBudget / deals.length) : 0,
        outstandingBalance, openInvoiceCount: invoices.length,
        preferredEventTypes: [...new Set(deals.map((d) => d.event_archetype).filter(Boolean))],
        recentDeals: deals.slice(0, 5),
      }, searched, {
        reason: deals.length === 0 ? 'no_deals_for_client' : 'has_data',
      });
    },
  });

  // ---- Semantic search (RAG) ----

  const search_workspace_knowledge = tool({
    description:
      'Search the workspace knowledge base for deal notes, follow-up history, proposal content, event notes, client messages (emails/texts), deal narratives, and historical activity summaries. ' +
      'Call this when the user asks about past discussions, agreements, quotes, pricing history, what a client said before, or anything not available through structured data tools. ' +
      'You can call this multiple times with different queries to find more relevant information.',
    inputSchema: z.object({
      query: z.string().describe('What to search for — be specific with names, dates, and topics'),
      sourceTypes: z.array(
        z.enum([
          'deal_note',
          'follow_up',
          'proposal',
          'event_note',
          'capture',
          'message',
          'narrative',
          'activity_log',
        ]),
      ).optional()
        .describe('Filter by content type. Omit to search all types.'),
      entityIds: z.array(z.string()).optional()
        .describe('Scope to specific entity IDs (people, companies, venues). Omit to search all.'),
    }),
    execute: async (params) => {
      // Auto-scope via page context if no explicit entity filter
      const entityIds = params.entityIds
        ?? (pageContext?.entityId ? [pageContext.entityId] : undefined);

      const results = await searchMemory(workspaceId, params.query, {
        sourceTypes: params.sourceTypes as SourceType[] | undefined,
        entityIds,
        limit: 5,
        threshold: 0.3,
      });

      const searched = await getSubstrateCounts(workspaceId);
      const rows = results.map((r) => ({
        content: r.content.slice(0, 800), // token budget guard
        source: r.sourceType,
        similarity: Math.round(r.similarity * 100) / 100,
        metadata: r.metadata,
      }));
      return envelope(rows, searched, {
        reason: rows.length === 0 ? 'no_matching_knowledge' : 'has_data',
      });
    },
  });

  // ---- Proactive insights ----

  const get_proactive_insights = tool({
    description:
      'Get proactive insights about things that need attention — unsigned proposals, unconfirmed crew, stale deals, shows without crew. ' +
      'Each insight includes urgency level (critical/high/medium/low), a suggested action, and a direct link (href) to the relevant page. ' +
      'Call this when the user asks "what needs my attention?", "anything I should know about?", or "what\'s urgent?".',
    inputSchema: z.object({}),
    execute: async () => {
      const { getPendingInsights } = await import('@/app/(dashboard)/(features)/aion/actions/aion-insight-actions');
      const insights = await getPendingInsights(workspaceId, 10);
      const searched = await getSubstrateCounts(workspaceId);

      const rows = insights.map((i) => ({
        id: i.id,
        type: i.triggerType,
        title: i.title,
        priority: i.priority,
        urgency: i.urgency,
        suggestedAction: i.suggestedAction,
        href: i.href,
        entityType: i.entityType,
        entityId: i.entityId,
        context: i.context,
      }));
      return envelope(rows, searched, {
        reason: rows.length === 0 ? 'no_proactive_lines' : 'has_data',
      });
    },
  });

  const dismiss_insight = tool({
    description: 'Dismiss a proactive insight so it won\'t be shown again. Use when the user says "I know about that", "dismiss", "got it", or "skip this one".',
    inputSchema: z.object({
      insightId: z.string().describe('The insight ID to dismiss'),
    }),
    execute: async (params) => {
      const { dismissInsight } = await import('@/app/(dashboard)/(features)/aion/actions/aion-insight-actions');
      const result = await dismissInsight(params.insightId);
      return { dismissed: result.success, insightId: params.insightId };
    },
  });

  // ---- Run of Show ----

  const get_run_of_show = tool({
    description: 'Get the run-of-show timeline for an event — all sections and cues in order. Shows the production schedule.',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from deal/page context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
    }),
    execute: async (params) => {
      // Resolve event ID from context
      let eventId = params.eventId;
      if (!eventId && ctx.pageContext?.type === 'event' && ctx.pageContext.entityId) {
        eventId = ctx.pageContext.entityId;
      }
      if (!eventId && (params.dealId || (ctx.pageContext?.type === 'deal' && ctx.pageContext.entityId))) {
        const dId = params.dealId ?? ctx.pageContext?.entityId;
        if (dId) {
          const deal = await getDeal(dId);
          eventId = deal?.event_id ?? undefined;
        }
      }
      if (!eventId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'event_not_found', hint: 'No event context. Specify an eventId or dealId.' });
      }

      const { fetchSections, fetchCues } = await import('@/features/run-of-show/api/ros');
      const [sections, cues] = await Promise.all([fetchSections(eventId), fetchCues(eventId)]);
      const searched = await getSubstrateCounts(workspaceId);

      const hasData = sections.length > 0 || cues.length > 0;
      return envelope({
        sections: sections.map((s) => ({
          id: s.id, title: s.title, startTime: s.start_time, color: s.color, notes: s.notes,
        })),
        cues: cues.map((c) => ({
          id: c.id, title: c.title, startTime: c.start_time,
          durationMinutes: c.duration_minutes, type: c.type,
          sectionId: c.section_id, notes: c.notes,
        })),
        sectionCount: sections.length,
        cueCount: cues.length,
      }, searched, {
        reason: hasData ? 'has_data' : 'no_ros_for_event',
      });
    },
  });

  // ---- Event Financials ----

  const get_event_financials = tool({
    description: 'Get the full financial picture for an event: revenue, costs, expenses, labor, margin, collected vs outstanding, and all transactions.',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from deal/page context if omitted)'),
      dealId: z.string().optional().describe('Deal ID (for event resolution)'),
    }),
    execute: async (params) => {
      let eventId = params.eventId;
      if (!eventId && ctx.pageContext?.type === 'event' && ctx.pageContext.entityId) {
        eventId = ctx.pageContext.entityId;
      }
      if (!eventId && (params.dealId || (ctx.pageContext?.type === 'deal' && ctx.pageContext.entityId))) {
        const dId = params.dealId ?? ctx.pageContext?.entityId;
        if (dId) {
          const deal = await getDeal(dId);
          eventId = deal?.event_id ?? undefined;
        }
      }
      if (!eventId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'event_not_found', hint: 'No event context. Specify an eventId or dealId.' });
      }

      const { getEventLedger } = await import('@/features/finance/api/get-event-ledger');
      const ledger = await getEventLedger(eventId);
      if (!ledger) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(null, searched, { reason: 'no_financials_for_event' });
      }

      const searched = await getSubstrateCounts(workspaceId);
      return envelope({
        totalRevenue: ledger.fmt.totalRevenue,
        totalCost: ledger.fmt.totalCost,
        margin: ledger.fmt.margin,
        marginPercent: `${ledger.marginPercent}%`,
        collected: ledger.fmt.collected,
        outstanding: ledger.fmt.outstanding,
        projectedRevenue: ledger.fmt.projectedRevenue,
        crewCost: ledger.fmt.crewCost,
        projectedCost: ledger.fmt.projectedCost,
        effectiveHourlyRate: ledger.fmt.effectiveHourlyRate,
        crewRateCompleteness: ledger.crewRateCompleteness,
        transactionCount: ledger.transactions.length,
        transactions: ledger.transactions.slice(0, 10).map((t) => ({
          type: t.type, label: t.label, amount: t.amount, inbound: t.inbound, status: t.status,
        })),
      }, searched);
    },
  });

  // ---- Plan-tab Aion card signals ----

  const get_event_signals = tool({
    description:
      'Get the per-event signal stack — drift, silence, and conflict signals for a show in the production phase (post-handoff, pre-show). ' +
      'These are the same signals shown on the Aion Plan card, so your read of the show will match what the user sees. ' +
      'Categories: cross-show conflicts (crew/gear double-booked), money timing (deposit overdue, final invoice unsent), run-of-show staleness, stakeholder silence, and show-health overrides. ' +
      'Each signal includes a label, a concrete value, polarity (positive/negative/neutral), severity (high/medium/low), and a natural-language sentence you can quote. ' +
      'Use when the user asks "what could go wrong with this show?", "is everything on track?", "what needs my attention?", or "how is Friday looking?". ' +
      'Narrate in prose; never aggregate the signals into a probability or readiness score (that\u2019s the Show Health pill\u2019s job, not yours).',
    inputSchema: z.object({
      eventId: z.string().optional().describe('Event ID (resolved from page/deal context if omitted)'),
      dealId: z.string().optional().describe('Deal ID — used to look up the linked event when no eventId is given'),
    }),
    execute: async (params) => {
      let eventId = params.eventId;
      if (!eventId && ctx.pageContext?.type === 'event' && ctx.pageContext.entityId) {
        eventId = ctx.pageContext.entityId;
      }
      if (!eventId && (params.dealId || (ctx.pageContext?.type === 'deal' && ctx.pageContext.entityId))) {
        const dId = params.dealId ?? ctx.pageContext?.entityId;
        if (dId) {
          const deal = await getDeal(dId);
          eventId = deal?.event_id ?? undefined;
        }
      }
      if (!eventId) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'event_not_found', hint: 'No event in view. Provide eventId or dealId for a deal that has been handed over.' });
      }

      const { getEventSignals } = await import('@/app/(dashboard)/(features)/crm/actions/get-event-signals');
      const signals = await getEventSignals(eventId);
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(signals, searched, {
        reason: signals.length === 0 ? 'no_signals_to_report' : 'has_data',
        hint: signals.length === 0
          ? 'No signals fired — narrate that the show is advancing on cadence. Do NOT invent concerns.'
          : 'Quote the `sentence` field verbatim or paraphrase tightly. Lead with the highest-severity signal. Never aggregate into a status verdict.',
      });
    },
  });

  // ---- Cross-deal lookup (Phase 2, Sprint 1) ----
  //
  // Answers the Henderson question: "what did we charge client X last June for
  // an event like this?" Phase 1's structured-context block only sees the
  // current deal, so cross-deal pricing references required RAG or trawling
  // the UI. `lookup_historical_deals` is the structured-first answer.
  //
  // Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.1.
  //
  // Workspace isolation discipline (Critic §Risk 2): the query filters by
  // `workspace_id = ctx.workspaceId` at the SQL layer. RLS would also clamp
  // this, but Critic flagged that `directory.entities` is cross-workspace
  // visible via PARTNER edges — so a fuzzy `client_name_query` match could
  // surface a same-named entity from another workspace unless we filter deals
  // by workspace_id explicitly. Belt-and-suspenders is cheap here.
  const lookup_historical_deals = tool({
    description:
      'Search deals and return pricing. The primary deal-search tool — use for ' +
      'ANY question about deal pricing, totals, or past client work. ' +
      'Handles: "how much did we charge for X", "what did we quote for Y", ' +
      '"what did Henderson pay last June", "find similar deals". ' +
      'Searches by deal title, client entity, contact person, or structural ' +
      'similarity — all at once. Works for weddings (title-based), corporate ' +
      'deals (client entity), and anything in between. ' +
      'Returns per-deal payloads with title, client name, accepted total, ' +
      'close date, status, and a headline of the largest line item. ' +
      'Pass client_name_query with whatever the user said verbatim — the tool ' +
      "strips to the essentials. Don't pre-filter by status unless the user " +
      "explicitly asked for won/lost; a 'working' deal is still a valid pricing reference.",
    inputSchema: z.object({
      client_entity_id: z.string().optional().describe('Exact directory entity id for the client'),
      client_name_query: z.string().optional().describe('Fuzzy match on directory.entities.display_name'),
      similar_to_deal_id: z.string().optional().describe('Structural similarity to the given deal (event archetype, venue, month-of-year, headcount ±25%)'),
      filters: z.object({
        date_range: z.tuple([z.string(), z.string()]).optional().describe('[start, end] in YYYY-MM-DD'),
        status: z.enum(['won', 'lost', 'any']).optional().describe('Deal status filter. Default: any'),
        min_value: z.number().optional().describe('Minimum accepted total in cents'),
        max_value: z.number().optional().describe('Maximum accepted total in cents'),
        venue_entity_id: z.string().optional().describe('Scope to a specific venue'),
      }).optional(),
      limit: z.number().int().min(1).max(10).optional().describe('Max results. Default 5, cap 10.'),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      const limit = Math.min(params.limit ?? 5, 10);

      const clientEntityIds = await resolveClientEntityIds(
        supabase,
        workspaceId,
        params.client_entity_id,
        params.client_name_query,
      );

      const source = params.similar_to_deal_id
        ? await fetchSimilarityContext(supabase, workspaceId, params.similar_to_deal_id)
        : null;

      // No short-circuit on empty entity list — the deal-title fallback
      // inside fetchCandidateDeals catches wedding-style deals where the
      // title carries the client names.
      const rows = await fetchCandidateDeals(supabase, workspaceId, {
        limit,
        hasSimilarity: !!source,
        excludeDealId: params.similar_to_deal_id,
        clientEntityIds,
        clientNameQuery: params.client_name_query,
        filters: params.filters,
      });
      if (rows == null) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'no_matching_deals', hint: 'Deal lookup failed.' });
      }
      if (rows.length === 0) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, {
          reason: searched.deals === 0 ? 'no_closed_deals_yet' : 'no_matching_deals',
        });
      }

      const guestByEventId = source
        ? await fetchGuestCounts(supabase, rows.map((r) => r.event_id).filter((x): x is string => Boolean(x)))
        : new Map<string, number>();

      const scored = rows.map((r) => ({
        row: r,
        score: source ? scoreStructuralSimilarity(source, r, r.event_id ? guestByEventId.get(r.event_id) ?? null : null) : 0,
      }));
      const ranked = source
        ? scored.filter((s) => s.score > 0).sort((a, b) =>
            b.score - a.score || (b.row.proposed_date ?? '').localeCompare(a.row.proposed_date ?? ''),
          )
        : scored;

      const totalCandidates = ranked.length;
      const sliced = ranked.slice(0, limit);
      const candidateDealIds = sliced.map((s) => s.row.id);

      // Resolve client names via both organization_id AND main_contact_id
      // in one name-map fetch. Wedding deals typically store the client on
      // main_contact_id (individual person), so organization-only resolution
      // left client_name=null on ~half of deals.
      const nameEntityIds: string[] = [];
      for (const s of sliced) {
        if (s.row.organization_id) nameEntityIds.push(s.row.organization_id);
        if (s.row.main_contact_id) nameEntityIds.push(s.row.main_contact_id);
      }
      const [dealTotals, clientNameMap] = await Promise.all([
        computeDealTotals(supabase, candidateDealIds),
        fetchClientNames(supabase, workspaceId, nameEntityIds),
      ]);

      const deals = sliced.map(({ row }) => {
        const moneyInfo = dealTotals.get(row.id);
        // Prefer organization name (company / couple's surname entity) over
        // individual contact name when both exist.
        const clientName =
          (row.organization_id && clientNameMap.get(row.organization_id)) ||
          (row.main_contact_id && clientNameMap.get(row.main_contact_id)) ||
          null;
        return {
          deal_id: row.id,
          title: capString(row.title, 60),
          client_name: clientName,
          final_accepted_total: moneyInfo?.total ?? null,
          close_date: row.won_at ?? row.lost_at ?? null,
          proposed_date: row.proposed_date,
          status: row.status,
          event_archetype: row.event_archetype,
          headline: capString(moneyInfo?.headline ?? null, 80),
        };
      });

      // Phase 2 launch telemetry — single structured line grepable from logs.
      // Tracks usage pattern + tool-chain cost without adding a new metric
      // store. `similar_mode` lets us see whether owners lean on fuzzy names
      // or "deals like this one" — informs whether RAG (Phase 3) is worth
      // the embedding-pipeline investment.
      console.log(
        `[aion.lookup_historical_deals] workspace=${workspaceId} returned=${deals.length} candidates=${totalCandidates} truncated=${totalCandidates > limit} similar_mode=${source ? 'structural' : 'name_or_filter'}`,
      );

      const searched = await getSubstrateCounts(workspaceId);
      return envelope(deals, searched, {
        reason: deals.length === 0 ? 'no_matching_deals' : 'has_data',
        hint: totalCandidates > limit ? `Showing top ${limit} of ${totalCandidates} matches.` : undefined,
      });
    },
  });

  // ---- Catalog lookup (Phase 2, Sprint 1, Week 2) ----
  //
  // Wraps the `public.aion_lookup_catalog` SECURITY DEFINER RPC (migration
  // 20260513000000). The RPC is authenticated-only with an explicit
  // workspace-member check and is REVOKEd from anon/PUBLIC per the
  // feedback_postgres_function_grants discipline.
  //
  // Why an RPC (and not a direct `.from('packages')` call)?
  //   1. Forward-compat: when catalog moves to its own schema (CLAUDE.md rule
  //      7 — `catalog` not PostgREST-exposed), the tool surface stays.
  //   2. Defensive discipline: SECURITY DEFINER + workspace-member check
  //      still prevents cross-workspace reads even if RLS were ever relaxed.
  //
  // Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.1.2.
  const lookup_catalog = tool({
    description:
      'Search the workspace catalog (packages + items) by name or description. ' +
      'Returns default price, category, a one-line description, and the catalog id. ' +
      'Use when the user asks "what do we charge for X", "do we sell Y", or pricing-reference questions. ' +
      'Does NOT do semantic search — plain fuzzy name/description match. For semantic pricing intent, combine with lookup_historical_deals.',
    inputSchema: z.object({
      query: z.string().describe('Term to search for. Empty string returns recent active entries.'),
      kind: z.enum(['package', 'item', 'any']).optional().describe("Filter by type. 'package' = container, 'item' = individual service/rental/etc. Default: any."),
      limit: z.number().int().min(1).max(8).optional().describe('Max results. Default 5, cap 8.'),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      const { data, error } = await supabase.rpc('aion_lookup_catalog', {
        p_workspace_id: workspaceId,
        p_query: params.query ?? '',
        p_kind: params.kind ?? 'any',
        p_limit: params.limit ?? 5,
      });
      if (error) {
        // Don't echo the raw database error back to the model — it can contain
        // schema hints. Give a clean boundary message; Sonnet handles it.
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'no_matching_catalog', hint: 'Catalog lookup failed.' });
      }
      type Row = {
        id: string;
        name: string;
        category: string;
        price: number | null;
        description: string | null;
        kind: 'package' | 'item';
      };
      const rows = (data ?? []) as Row[];
      const results = rows.map((r) => ({
        id: r.id,
        name: r.name,
        kind: r.kind,
        category: r.category,
        price: r.price,
        description: capString(r.description, 140),
      }));
      // Phase 2 launch telemetry. Same shape as lookup_historical_deals so
      // both tools can be grepped side-by-side for tool-chain analysis.
      console.log(
        `[aion.lookup_catalog] workspace=${workspaceId} returned=${results.length} kind=${params.kind ?? 'any'} had_query=${!!params.query?.trim()}`,
      );
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(results, searched, {
        reason: results.length === 0 ? 'no_matching_catalog' : 'has_data',
      });
    },
  });

  // ---- Message lookup (Phase 3, Sprint 1, Week 1 — D4 pull-back) ----
  //
  // Deterministic read over ops.messages. Ships BEFORE the RAG path
  // (lookup_client_messages, Week 2) so "what's the latest from Sarah"
  // works on reply data the moment the ingestion hook lands.
  //
  // Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.2 D4.
  //
  // Scoping discipline (C5 fix):
  //   1. Workspace RLS on ops.messages filters rows the caller can't see.
  //   2. When `deal_id` is provided, verify it's in the caller's workspace
  //      via deals.workspace_id (belt + RLS).
  //   3. When `entity_id` is provided, verify it's in the caller's workspace
  //      via directory.entities.owner_workspace_id.
  //   4. When only `entity_id` is provided, default to the caller's current
  //      page-context deal (narrow scope). Passing `deal_id: null`
  //      explicitly is the widen-to-all-deals signal.
  //   5. When both are provided they're AND'd — intersection, not union.
  //
  // Injection safety (B4): body_text is wrapped via wrapUntrusted() before
  // leaving the handler. Every caller downstream (model context assembly,
  // CitationPill rendering) therefore sees `<untrusted>...</untrusted>`
  // delimiters instead of raw client text.
  //
  // ops.messages row shape: see migration 20260429000000.
  const get_latest_messages = tool({
    description:
      'Fetch the most recent messages (emails, SMS, call notes) on a deal ' +
      'or with a specific client contact. Deterministic — use this for ' +
      '"what did Sarah say last", "show me the last 3 emails on this deal", ' +
      '"any reply from Henderson today". Returns verbatim body excerpts ' +
      'with sender, channel, direction, and timestamp. ' +
      'For semantic queries ("what did Sarah say about dinner timing") use ' +
      'lookup_client_messages (RAG) instead. ' +
      'Scope defaults to the current deal in view when the user has a deal ' +
      'page context; pass deal_id explicitly to switch, or deal_id=null ' +
      'with entity_id to widen to all deals with that person.',
    inputSchema: z.object({
      deal_id: z.string().nullable().optional().describe(
        'Deal UUID to fetch messages for. Defaults to the current deal in view ' +
        'if present. Pass null explicitly (with entity_id set) to widen ' +
        'across all deals for that entity.',
      ),
      entity_id: z.string().optional().describe(
        'Directory entity UUID (person or org) to filter by. Matches either ' +
        'the message sender OR the thread\'s primary entity.',
      ),
      direction: z.enum(['inbound', 'outbound', 'any']).optional().describe(
        'Filter by message direction. Default: any.',
      ),
      limit: z.number().int().min(1).max(10).optional().describe(
        'Max results. Default 5, cap 10.',
      ),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      const limit = Math.min(params.limit ?? 5, 10);

      // Resolve deal scope — explicit null = widen; undefined = fall back to
      // page context; value = use it. Zod preserves the undefined-vs-null
      // distinction because both are allowed and the object key's presence
      // is what carries the widen intent.
      const dealSpecifiedNull =
        Object.prototype.hasOwnProperty.call(params, 'deal_id') && params.deal_id === null;
      const dealId =
        params.deal_id ??
        (dealSpecifiedNull ? null : resolveDealId(undefined));

      // C5 validation — if caller supplied a deal_id value, verify it's
      // inside the caller's workspace before querying messages.
      if (dealId) {
        const { data: dealRow } = await supabase
          .from('deals')
          .select('id')
          .eq('id', dealId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (!dealRow) {
          const searched = await getSubstrateCounts(workspaceId);
          return envelope([], searched, { reason: 'deal_not_found', hint: 'Deal not in workspace.' });
        }
      }

      // C5 validation — same for entity_id.
      if (params.entity_id) {
        const { data: entRow } = await supabase
          .schema('directory')
          .from('entities')
          .select('id')
          .eq('id', params.entity_id)
          .eq('owner_workspace_id', workspaceId)
          .maybeSingle();
        if (!entRow) {
          const searched = await getSubstrateCounts(workspaceId);
          return envelope([], searched, { reason: 'entity_not_found', hint: 'Entity not in workspace.' });
        }
      }

      // Core query — ops.messages joined to the thread for deal_id + subject.
      // Workspace filter + RLS both fire; the redundant .eq is belt + suspenders.
      let q = buildLatestMessagesBaseQuery(supabase, workspaceId, limit);

      if (dealId) {
        q = q.eq('thread.deal_id', dealId);
      }
      if (params.entity_id) {
        // Sender-entity match is the common "what did Sarah say" path, but
        // thread.primary_entity_id catches outbound-only messages from the
        // workspace where from_entity_id is NULL (owner address, not in
        // directory). Supabase chains don't support `or()` across a joined
        // table cleanly, so we run two queries and merge.
        const altQ = buildLatestMessagesBaseQuery(supabase, workspaceId, limit)
          .eq('thread.primary_entity_id', params.entity_id);
        const senderQ = q.eq('from_entity_id', params.entity_id);
        const [senderRes, altRes] = await Promise.all([senderQ, altQ]);
        const merged = new Map<string, MessageRow>();
        for (const r of ((senderRes.data ?? []) as unknown as MessageRow[])) merged.set(r.id, r);
        for (const r of ((altRes.data ?? []) as unknown as MessageRow[])) merged.set(r.id, r);
        const rows = [...merged.values()]
          .sort((a, b) => b.created_at.localeCompare(a.created_at))
          .slice(0, limit);
        const { messages } = renderMessages(rows, params.direction ?? 'any');
        const searched = await getSubstrateCounts(workspaceId);
        return envelope(messages, searched, {
          reason: messages.length === 0 ? 'no_messages_from_entity' : 'has_data',
        });
      }

      if (params.direction && params.direction !== 'any') {
        q = q.eq('direction', params.direction);
      }

      const { data, error } = await q;
      if (error) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, { reason: 'no_activity_in_window', hint: 'Message lookup failed.' });
      }
      const { messages } = renderMessages((data ?? []) as MessageRow[], params.direction ?? 'any');
      const searched = await getSubstrateCounts(workspaceId);
      return envelope(messages, searched, {
        reason: messages.length === 0 ? 'no_activity_in_window' : 'has_data',
      });
    },
  });

  // ---- Semantic message search (Phase 3, Sprint 1, Week 2) ----
  //
  // Wraps cortex.match_memory with source_type='message' for questions where
  // the caller wants to find messages by what was SAID, not when or by whom.
  // "What did Sarah say about dinner timing" / "any mention of wireless
  // upgrade pricing" / "did Becca ever agree to the 9pm cut".
  //
  // Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.2 (lookup_client_messages).
  //
  // Relationship to get_latest_messages:
  //   • get_latest_messages — deterministic, ORDER BY date — "show me the last 3"
  //   • lookup_client_messages — vector search — "what was said about X"
  //   Sonnet / Haiku pick by intent; tool descriptions disambiguate.
  //
  // Scoping + safety (same discipline as get_latest_messages, C5 + B4):
  //   • deal_id / entity_id validated against caller's workspace.
  //   • When only entity_id provided, defaults to page-context deal (narrow);
  //     deal_id=null explicit widens.
  //   • body_excerpt cut on sentence boundary (C4), wrapped in <untrusted>.
  //   • Truncated-at-budget flag fires when the retrieval-budget cap trips.
  const lookup_client_messages = tool({
    description:
      'Semantic search over client message history (emails, SMS, call notes). ' +
      'Use for questions about what was discussed: "what did Sarah say about ' +
      'dinner timing", "any mention of the wireless upgrade", "did the client ' +
      'agree to the 9pm cut". ' +
      'Returns ranked body excerpts with sender, date, channel, and a ' +
      'message-id citation reference. Excerpts are cut on sentence boundaries ' +
      'and wrapped in <untrusted> delimiters — quote verbatim inside quotation ' +
      'marks, do not paraphrase. ' +
      'For chronological "latest N messages" queries, use get_latest_messages ' +
      'instead — it is deterministic and cheaper.',
    inputSchema: z.object({
      query: z.string().min(1).describe(
        'What to search for — natural language, include names and topics.',
      ),
      deal_id: z.string().nullable().optional().describe(
        'Deal UUID to scope to. Defaults to the current deal in view. Pass ' +
        'null (with entity_id set) to widen across all deals for the entity.',
      ),
      entity_id: z.string().optional().describe(
        'Directory entity UUID (person or org) to scope to. Matches messages ' +
        'from that sender or with that entity as thread primary.',
      ),
      channel: z.enum(['email', 'sms', 'any']).optional().describe(
        'Filter by message channel. Default: any.',
      ),
      limit: z.number().int().min(1).max(10).optional().describe(
        'Max matches. Default 5, cap 10.',
      ),
    }),
    execute: async (params) => {
      const supabase = await createClient();
      const limit = Math.min(params.limit ?? 5, 10);

      // Same explicit-null vs fall-back-to-context discipline as
      // get_latest_messages. Entity-only asks default to the current deal.
      const dealSpecifiedNull =
        Object.prototype.hasOwnProperty.call(params, 'deal_id') && params.deal_id === null;
      const dealId =
        params.deal_id ??
        (dealSpecifiedNull ? null : resolveDealId(undefined));

      if (dealId) {
        const { data: dealRow } = await supabase
          .from('deals')
          .select('id')
          .eq('id', dealId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        if (!dealRow) {
          const searched = await getSubstrateCounts(workspaceId);
          return envelope([], searched, { reason: 'deal_not_found', hint: 'Deal not in workspace.' });
        }
      }
      if (params.entity_id) {
        const { data: entRow } = await supabase
          .schema('directory')
          .from('entities')
          .select('id')
          .eq('id', params.entity_id)
          .eq('owner_workspace_id', workspaceId)
          .maybeSingle();
        if (!entRow) {
          const searched = await getSubstrateCounts(workspaceId);
          return envelope([], searched, { reason: 'entity_not_found', hint: 'Entity not in workspace.' });
        }
      }

      // Vector search. cortex.match_memory filters by workspace_id via RLS
      // (SECURITY INVOKER) and by source_type + entity_ids at the SQL level.
      const results = await searchMemory(workspaceId, params.query, {
        sourceTypes: ['message'],
        entityIds: params.entity_id ? [params.entity_id] : undefined,
        limit,
        threshold: 0.3,
      });

      if (results.length === 0) {
        const searched = await getSubstrateCounts(workspaceId);
        return envelope([], searched, {
          reason: searched.messages_in_window === 0 ? 'no_activity_in_window' : 'no_matching_knowledge',
        });
      }

      // Client-side filter on channel + deal_id. The vector search returns
      // by similarity — doing this post-filter keeps the ranked order intact.
      // If the filter drops us below `limit`, the caller knows there's no
      // additional budget spent on a second search.
      const messageIds = results.map((r) => r.sourceId);
      const { data: msgs } = await supabase
        .schema('ops')
        .from('messages')
        .select(
          'id, thread_id, direction, channel, from_address, from_entity_id, ai_summary, created_at, ' +
          'thread:message_threads!inner(deal_id, subject, primary_entity_id)',
        )
        .in('id', messageIds);
      const msgById = new Map<string, MessageRow>();
      for (const m of ((msgs ?? []) as unknown as MessageRow[])) msgById.set(m.id, m);

      let truncatedAtBudget = false;
      const matches = [];
      for (const r of results) {
        const msg = msgById.get(r.sourceId);
        if (!msg) continue;
        if (dealId && msg.thread?.deal_id !== dealId) continue;
        if (params.channel && params.channel !== 'any' && msg.channel !== params.channel) continue;

        const excerpt = sentenceBoundaryCut(r.content, MESSAGE_EXCERPT_CAP);
        if (r.content.length > excerpt.length) truncatedAtBudget = true;

        matches.push({
          messageId: msg.id,
          dealId: msg.thread?.deal_id ?? null,
          direction: msg.direction,
          channel: msg.channel,
          fromAddress: msg.from_address,
          fromEntityId: msg.from_entity_id,
          subject: msg.thread?.subject ?? null,
          bodyExcerpt: wrapUntrusted(excerpt + ' … (see full message)'),
          aiSummary: msg.ai_summary,
          sentAt: msg.created_at,
          similarity: Math.round(r.similarity * 100) / 100,
        });
      }

      console.log(
        `[aion.lookup_client_messages] workspace=${workspaceId} query_chars=${params.query.length} returned=${matches.length}`,
      );

      const searched = await getSubstrateCounts(workspaceId);
      return envelope(matches, searched, {
        reason: matches.length === 0 ? 'no_matching_knowledge' : 'has_data',
        hint: truncatedAtBudget ? 'Excerpts truncated at budget; quote verbatim inside quotes.' : undefined,
      });
    },
  });

  return {
    search_entities, get_entity_details,
    get_deal_details, get_deal_crew, get_deal_signals, get_proposal_details,
    check_crew_availability: check_crew_availability_tool,
    get_entity_schedule, get_calendar_events, get_entity_financial_summary,
    get_pipeline_summary, get_revenue_summary, get_revenue_trend, get_client_concentration, get_client_insights,
    search_workspace_knowledge, get_proactive_insights, dismiss_insight,
    get_run_of_show, get_event_financials, get_event_signals,
    lookup_historical_deals, lookup_catalog,
    get_latest_messages,
    lookup_client_messages,
  };
}

// ---------------------------------------------------------------------------
// get_latest_messages helpers — extracted so the execute handler stays under
// the repo's cognitive-complexity ceiling.
// ---------------------------------------------------------------------------

/**
 * Base Supabase chain for ops.messages lookups with the shared join + filters.
 * Returned as `any` because Supabase's relational-select generic types are
 * deeply recursive and don't survive being passed through a function boundary
 * without blowing the TS inference budget. This is the same pattern used by
 * the `applyBase` helper in `lookup_historical_deals`. All returned chains
 * are narrowed to MessageRow[] before the data leaves the handler.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildLatestMessagesBaseQuery(supabase: AuthedClient, workspaceId: string, limit: number): any {
  return supabase
    .schema('ops')
    .from('messages')
    .select(
      'id, thread_id, direction, channel, from_address, from_entity_id, body_text, ai_summary, created_at, ' +
      'thread:message_threads!inner(deal_id, subject, primary_entity_id)',
    )
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);
}

export type MessageRow = {
  id: string;
  thread_id: string;
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'sms' | 'call_note';
  from_address: string;
  from_entity_id: string | null;
  body_text: string | null;
  ai_summary: string | null;
  created_at: string;
  thread: {
    deal_id: string | null;
    subject: string | null;
    primary_entity_id: string | null;
  } | null;
};

/** Hard cap so a single handler can't leak tens of kilobytes into the model context. */
export const MESSAGE_EXCERPT_CAP = 400;

/**
 * Cut `text` to `limit` chars on a sentence boundary where possible, falling
 * back to word boundary, falling back to a hard cut with ellipsis (C4 full-
 * sentence-boundary discipline).
 */
export function sentenceBoundaryCut(text: string, limit: number): string {
  if (text.length <= limit) return text;
  const window = text.slice(0, limit);
  const punctMatch = window.match(/^[\s\S]*[.!?](?=\s|$)/);
  if (punctMatch && punctMatch[0].length >= limit * 0.5) {
    return punctMatch[0].trim() + '…';
  }
  const lastSpace = window.lastIndexOf(' ');
  if (lastSpace > limit * 0.5) return window.slice(0, lastSpace).trim() + '…';
  return window.trim() + '…';
}

export function renderMessages(rows: MessageRow[], direction: 'inbound' | 'outbound' | 'any') {
  const filtered = direction === 'any'
    ? rows
    : rows.filter((r) => r.direction === direction);

  const messages = filtered.map((r) => {
    const body = r.body_text ?? '';
    const excerpt = sentenceBoundaryCut(body, MESSAGE_EXCERPT_CAP);
    // B4 injection safety — body text is client-authored and flows into the
    // model's context window. Wrap before it leaves the handler.
    const bodyWrapped = excerpt ? wrapUntrusted(excerpt) : '';
    return {
      id: r.id,
      threadId: r.thread_id,
      dealId: r.thread?.deal_id ?? null,
      direction: r.direction,
      channel: r.channel,
      fromAddress: r.from_address,
      fromEntityId: r.from_entity_id,
      subject: r.thread?.subject ?? null,
      bodyExcerpt: bodyWrapped,
      truncated: body.length > excerpt.length,
      aiSummary: r.ai_summary, // structured, safe — owner-generated
      sentAt: r.created_at,
    };
  });
  return { messages, count: messages.length };
}
