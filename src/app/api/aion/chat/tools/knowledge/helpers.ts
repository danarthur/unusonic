/**
 * Pure helpers + async DB helpers shared across the knowledge tool factories.
 * Extracted from the original knowledge.ts during the Phase 0.5-style split.
 *
 * The pure helpers are unit-tested independently — see the §3.1 scoring rubric
 * and payload caps in the Phase 2 plan.
 */

import { wrapUntrusted } from '../../../lib/wrap-untrusted';
import type { AionToolContext } from '../types';
import {
  MESSAGE_EXCERPT_CAP,
  type AuthedClient,
  type CandidateFilters,
  type DealRow,
  type HistoricalDealCandidate,
  type HistoricalDealSourceContext,
  type MessageRow,
} from './types';

// ---------------------------------------------------------------------------
// Pure helpers — extracted from `lookup_historical_deals` so they can be
// unit-tested without mocking the supabase chain.
// ---------------------------------------------------------------------------

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
// Resolve helpers — closures over the tool context for current-page fallbacks.
// ---------------------------------------------------------------------------

export type ResolveHelpers = {
  resolveDealId: (explicit?: string) => string | null;
  resolveEntityId: (explicit?: string) => string | null;
};

export function makeResolveHelpers(ctx: AionToolContext): ResolveHelpers {
  const { pageContext } = ctx;
  return {
    /** Resolve a deal ID — use explicit param, fall back to page context */
    resolveDealId: (explicit?: string): string | null =>
      explicit || (pageContext?.type === 'deal' || pageContext?.type === 'proposal' ? pageContext.entityId : null),
    /** Resolve an entity ID — use explicit param, fall back to page context */
    resolveEntityId: (explicit?: string): string | null =>
      explicit || (pageContext?.type === 'entity' ? pageContext.entityId : null),
  };
}

// ---------------------------------------------------------------------------
// lookup_historical_deals helpers — private to the lookup tool group.
// Each helper covers one phase of the tool's flow so the main `execute`
// stays under the repo's cognitive-complexity ceiling.
// ---------------------------------------------------------------------------

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
export async function resolveClientEntityIds(
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
export async function fetchSimilarityContext(
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

export async function fetchCandidateDeals(
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
export async function fetchGuestCounts(supabase: AuthedClient, eventIds: string[]): Promise<Map<string, number>> {
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
export async function computeDealTotals(
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

export async function fetchClientNames(
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
export function buildLatestMessagesBaseQuery(supabase: AuthedClient, workspaceId: string, limit: number): any {
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
