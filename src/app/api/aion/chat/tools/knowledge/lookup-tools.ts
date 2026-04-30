/**
 * Cross-deal lookup tools — historical deals, catalog, and message lookups.
 * These share the heaviest helper surface (resolveClientEntityIds,
 * fetchSimilarityContext, fetchCandidateDeals, …) imported from ./helpers.
 */

import { tool } from 'ai';
import { z } from 'zod';
import { createClient } from '@/shared/api/supabase/server';
import { searchMemory } from '../../../lib/embeddings';
import { wrapUntrusted } from '../../../lib/wrap-untrusted';
import { envelope } from '../../../lib/retrieval-envelope';
import { getSubstrateCounts } from '../../../lib/substrate-counts';
import type { AionToolContext } from '../types';
import {
  buildLatestMessagesBaseQuery,
  capString,
  computeDealTotals,
  fetchCandidateDeals,
  fetchClientNames,
  fetchGuestCounts,
  fetchSimilarityContext,
  renderMessages,
  resolveClientEntityIds,
  scoreStructuralSimilarity,
  sentenceBoundaryCut,
  type ResolveHelpers,
} from './helpers';
import { MESSAGE_EXCERPT_CAP, type MessageRow } from './types';

export function createLookupKnowledgeTools(ctx: AionToolContext, helpers: ResolveHelpers) {
  const { workspaceId } = ctx;
  const { resolveDealId } = helpers;

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
    lookup_historical_deals,
    lookup_catalog,
    get_latest_messages,
    lookup_client_messages,
  };
}
