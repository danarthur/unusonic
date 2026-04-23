/**
 * Retrieval envelope — the contract every read-only Aion tool handler returns.
 *
 * Decided 2026-04-23 (Phase 3 Sprint 2, §3.13 cold-start hygiene, premium path).
 *   • `searched` carries flat integer counts — no nested references, ever.
 *     The two concerns (substrate trust + per-item citation) split cleanly:
 *     trust is served by counts; citation is served by the existing inline
 *     <citation kind="..." id="..."> markdown tag. Conflating them bloats
 *     model context and duplicates a mechanism that already works.
 *   • `result` is polymorphic by tool — T[] for lists, T | null for
 *     single-fetch, T for aggregates. The common fields stay flat so the
 *     system prompt branches uniformly on `reason`.
 *   • Empty-state rendering is enforced at the system-prompt layer. When a
 *     retrieval comes back empty, Aion's first sentence names the substrate.
 *     "I looked at your 3 deals, 47 messages, and 12 notes — nothing
 *     mentions Henderson." No new UI footer this sprint.
 */

import { z } from 'zod';

// ---------------------------------------------------------------------------
// Substrate inventory — always six flat integers, workspace-scoped.
// ---------------------------------------------------------------------------

export const substrateCountsSchema = z.object({
  deals:              z.number().int().nonnegative(),
  entities:           z.number().int().nonnegative(),
  messages_in_window: z.number().int().nonnegative(),
  notes:              z.number().int().nonnegative(),
  catalog_items:      z.number().int().nonnegative(),
  memory_chunks:      z.number().int().nonnegative(),
});
export type SubstrateCounts = z.infer<typeof substrateCountsSchema>;

// ---------------------------------------------------------------------------
// Adjacent reach-across — surfaced when the direct query is empty but related
// substrate exists. The canonical example from §3.13(a): "no Patel in deals
// yet. There's a thread in your inbox from sarah.patel@gmail about a May 18
// wedding — want me to start a deal from it?"
// ---------------------------------------------------------------------------

export const adjacentRefSchema = z.object({
  kind:  z.enum([
    'inbox_thread',
    'directory_entity',
    'historical_deal',
    'catalog_item',
    'event',
  ]),
  id:    z.string(),
  label: z.string(),
});
export type AdjacentRef = z.infer<typeof adjacentRefSchema>;

// ---------------------------------------------------------------------------
// Reason codes. Closed enum — every retrieval handler picks from this list,
// system prompt enumerates. New codes extend the enum; handlers shouldn't
// invent strings. `has_data` is the non-empty reason so downstream branching
// reads `reason` uniformly regardless of result shape.
// ---------------------------------------------------------------------------

export const envelopeReasonSchema = z.enum([
  'has_data',
  'no_messages_from_entity',
  'no_deals_for_client',
  'no_closed_deals_yet',
  'no_activity_in_window',
  'no_matching_knowledge',
  'no_matching_catalog',
  'no_matching_deals',
  'no_matching_entities',
  'no_upcoming_shows',
  'no_open_invoices',
  'no_crew_on_deal',
  'no_proposal_on_deal',
  'no_ros_for_event',
  'no_financials_for_event',
  'no_proactive_lines',
  'no_follow_up_queue',
  'no_templates',
  'no_crew_with_equipment',
  'no_config_yet',
  'entity_not_found',
  'deal_not_found',
  'event_not_found',
  'proposal_not_found',
  'workspace_empty',
]);
export type EnvelopeReason = z.infer<typeof envelopeReasonSchema>;

// ---------------------------------------------------------------------------
// Envelope.
// ---------------------------------------------------------------------------

export function retrievalEnvelopeSchema<T extends z.ZodTypeAny>(resultSchema: T) {
  return z.object({
    result:   resultSchema,
    reason:   envelopeReasonSchema,
    searched: substrateCountsSchema,
    hint:     z.string().optional(),
    adjacent: z.array(adjacentRefSchema).optional(),
  });
}

export type RetrievalEnvelope<T> = {
  result:   T;
  reason:   EnvelopeReason;
  searched: SubstrateCounts;
  hint?:    string;
  adjacent?: AdjacentRef[];
};

/**
 * Convenience builder for handlers. Defaults `reason` to `has_data` when the
 * result is non-empty and `workspace_empty` when it is — handlers should
 * override with a more specific reason whenever they can. The default exists
 * so the 23-handler retrofit can land incrementally without gaps.
 *
 * Emptiness rules:
 *   • null / undefined     → empty
 *   • []                   → empty
 *   • {} with zero keys    → empty (aggregates where every count is zero)
 *   • anything else        → populated
 */
export function envelope<T>(
  result:   T,
  searched: SubstrateCounts,
  opts: {
    reason?:   EnvelopeReason;
    hint?:     string;
    adjacent?: AdjacentRef[];
  } = {},
): RetrievalEnvelope<T> {
  const isEmpty =
    result === null ||
    result === undefined ||
    (Array.isArray(result) && result.length === 0);

  return {
    result,
    reason: opts.reason ?? (isEmpty ? 'workspace_empty' : 'has_data'),
    searched,
    ...(opts.hint ? { hint: opts.hint } : {}),
    ...(opts.adjacent && opts.adjacent.length > 0 ? { adjacent: opts.adjacent } : {}),
  };
}
