/**
 * Aion Embedding Utilities
 *
 * Shared functions for generating, storing, and searching vector embeddings.
 * Follows the proven pattern from catalog-embeddings.ts.
 *
 * Uses Voyage AI voyage-3 (1024d) via the Vercel AI SDK.
 * Writes to cortex.memory via SECURITY DEFINER RPCs.
 */

import { embed, embedMany } from 'ai';
import { createVoyage } from 'voyage-ai-provider';
import type { Json } from '@/types/supabase';
import { recordAionEvent } from './event-logger';

const voyage = createVoyage({ apiKey: process.env.VOYAGE_API_KEY! });

// Wk 16 §3.10 cost-per-seat. Voyage voyage-3 list price is $0.06 per million
// input tokens (rotation requires a code change — fine at v1 since prices
// shift ~yearly; promotion to a tier_pricing table is a Wk 17+ exercise).
const VOYAGE_3_USD_PER_MTOK = 0.06;

// ── Types ────────────────────────────────────────────────────────────────────

export type SourceType =
  | 'deal_note'
  | 'follow_up'
  | 'proposal'
  | 'event_note'
  | 'capture'
  | 'message'
  | 'narrative'
  | 'activity_log'
  | 'catalog';

export type ContextHeaderInput = {
  dealTitle?: string | null;
  clientName?: string | null;
  eventTitle?: string | null;
  entityName?: string | null;
  date?: string | null;
  channel?: string | null;
  direction?: 'inbound' | 'outbound' | null;
  monthLabel?: string | null;
  packageName?: string | null;
  packageCategory?: string | null;
};

// ── Embedding generation ─────────────────────────────────────────────────────

/**
 * Generate an embedding vector for a text string.
 * Optionally prepend a contextual header for better retrieval recall
 * (Anthropic's contextual retrieval technique: +20-49% recall).
 */
export async function embedContent(
  text: string,
  contextHeader?: string | null,
): Promise<number[]> {
  const valueToEmbed = contextHeader
    ? `${contextHeader}\n\n${text}`
    : text;

  const { embedding } = await embed({
    model: voyage.textEmbeddingModel('voyage-3'),
    value: valueToEmbed,
  });

  return embedding;
}

// ── Context header builder ───────────────────────────────────────────────────

/**
 * Build a contextual header that gets prepended to content before embedding.
 * This improves retrieval recall by grounding the embedding in entity context.
 */
export function buildContextHeader(
  sourceType: SourceType,
  input: ContextHeaderInput,
): string {
  const parts: string[] = [];

  switch (sourceType) {
    case 'deal_note':
      parts.push('This is a deal note');
      if (input.dealTitle) parts.push(`about "${input.dealTitle}"`);
      if (input.clientName) parts.push(`for client ${input.clientName}`);
      break;
    case 'follow_up':
      parts.push('This is a follow-up log entry');
      if (input.dealTitle) parts.push(`for "${input.dealTitle}"`);
      if (input.channel) parts.push(`via ${input.channel}`);
      if (input.clientName) parts.push(`with ${input.clientName}`);
      break;
    case 'proposal':
      parts.push('This is proposal content');
      if (input.dealTitle) parts.push(`for "${input.dealTitle}"`);
      if (input.clientName) parts.push(`for client ${input.clientName}`);
      break;
    case 'event_note':
      parts.push('This is an event note');
      if (input.eventTitle) parts.push(`for "${input.eventTitle}"`);
      break;
    case 'capture':
      parts.push('This is a voice/text capture');
      if (input.entityName) parts.push(`about ${input.entityName}`);
      break;
    case 'message': {
      const dir = input.direction === 'outbound' ? 'outbound' : 'inbound';
      parts.push(`This is an ${dir} ${input.channel ?? 'email'} message`);
      if (input.dealTitle) parts.push(`for "${input.dealTitle}"`);
      if (input.clientName) {
        parts.push(
          input.direction === 'outbound'
            ? `to ${input.clientName}`
            : `from ${input.clientName}`,
        );
      }
      break;
    }
    case 'narrative':
      parts.push('This is the deal narrative');
      if (input.dealTitle) parts.push(`for "${input.dealTitle}"`);
      if (input.clientName) parts.push(`with client ${input.clientName}`);
      break;
    case 'activity_log':
      parts.push('This is a deal activity summary');
      if (input.dealTitle) parts.push(`for "${input.dealTitle}"`);
      if (input.monthLabel) parts.push(`covering ${input.monthLabel}`);
      break;
    case 'catalog':
      parts.push('This is a catalog package');
      if (input.packageName) parts.push(`named "${input.packageName}"`);
      if (input.packageCategory) parts.push(`in category ${input.packageCategory}`);
      break;
  }

  if (input.date) parts.push(`from ${input.date}`);

  return parts.join(' ') + '.';
}

// ── Upsert embedding ─────────────────────────────────────────────────────────

export type UpsertOutcome =
  | { status: 'inserted' }
  | { status: 'skipped'; reason: 'empty_content' }
  | { status: 'failed'; stage: 'embed' | 'rpc'; message: string };

export type EmbedItem = {
  workspaceId: string;
  sourceType: SourceType;
  sourceId: string;
  contentText: string;
  contextHeader?: string | null;
  entityIds?: string[];
  metadata?: Record<string, unknown>;
};

// Voyage's documented per-request cap is 128 inputs; keep a margin.
const EMBED_BATCH_SIZE = 96;

/**
 * Wk 16 §3.10 cost-per-seat. Group chunk items by workspace and prorate the
 * chunk's total token usage. Telemetry never throws; failures log but don't
 * block the upsert.
 */
function emitEmbedCostForChunk(chunkItems: EmbedItem[], usage: { tokens?: number } | undefined): void {
  const totalTokens = typeof usage?.tokens === 'number' ? usage.tokens : null;
  const wsCount = new Map<string, number>();
  for (const item of chunkItems) {
    wsCount.set(item.workspaceId, (wsCount.get(item.workspaceId) ?? 0) + 1);
  }
  for (const [workspaceId, itemCount] of wsCount) {
    const tokens = totalTokens !== null ? Math.round((itemCount / chunkItems.length) * totalTokens) : null;
    const usd = tokens !== null ? (tokens / 1_000_000) * VOYAGE_3_USD_PER_MTOK : 0;
    void recordAionEvent({
      eventType: 'aion.embed_cost',
      workspaceId,
      payload: { items: itemCount, tokens, model: 'voyage-3', usd },
    });
  }
}

/**
 * Batch-embed and upsert many items in one flow.
 *
 *  1. Empty-content items are skipped (no API call).
 *  2. Remaining items are embedded in chunks of 96 via `embedMany` — one
 *     Voyage round-trip per chunk instead of one per item, which dodges
 *     rate-limit churn on large backfills.
 *  3. Each embedded item is upserted via the SECURITY DEFINER RPC.
 *
 * Returns a per-input outcome array in the same order as the input.
 */
export async function upsertEmbeddingBatch(items: EmbedItem[]): Promise<UpsertOutcome[]> {
  const outcomes: (UpsertOutcome | null)[] = new Array(items.length).fill(null);

  const activeIndexes: number[] = [];
  const activeTexts: string[] = [];
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!item.contentText.trim()) {
      outcomes[i] = { status: 'skipped', reason: 'empty_content' };
      continue;
    }
    activeIndexes.push(i);
    activeTexts.push(
      item.contextHeader ? `${item.contextHeader}\n\n${item.contentText}` : item.contentText,
    );
  }

  const embeddings: (number[] | null)[] = new Array(activeIndexes.length).fill(null);

  for (let offset = 0; offset < activeTexts.length; offset += EMBED_BATCH_SIZE) {
    const chunkValues = activeTexts.slice(offset, offset + EMBED_BATCH_SIZE);
    try {
      const result = await embedMany({
        model: voyage.textEmbeddingModel('voyage-3'),
        values: chunkValues,
      });
      const chunkEmbeddings = result.embeddings;
      for (let j = 0; j < chunkEmbeddings.length; j++) {
        embeddings[offset + j] = chunkEmbeddings[j];
      }
      const chunkItems = activeIndexes.slice(offset, offset + chunkValues.length).map((idx) => items[idx]);
      emitEmbedCostForChunk(chunkItems, (result as { usage?: { tokens?: number } }).usage);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(
        `[aion/embeddings] embedMany chunk failed (offset ${offset}, size ${chunkValues.length}):`,
        message,
      );
      for (let j = 0; j < chunkValues.length; j++) {
        outcomes[activeIndexes[offset + j]] = { status: 'failed', stage: 'embed', message };
      }
    }
  }

  const { getSystemClient } = await import('@/shared/api/supabase/system');
  const system = getSystemClient();

  for (let i = 0; i < activeIndexes.length; i++) {
    const originalIdx = activeIndexes[i];
    if (outcomes[originalIdx] !== null) continue;

    const item = items[originalIdx];
    const embedding = embeddings[i];
    if (!embedding) {
      outcomes[originalIdx] = { status: 'failed', stage: 'embed', message: 'Embedding missing after chunk' };
      continue;
    }

    const embeddingStr = `[${embedding.join(',')}]`;
    try {
      const { error } = await system.schema('cortex').rpc('upsert_memory_embedding', {
        p_workspace_id: item.workspaceId,
        p_source_type: item.sourceType,
        p_source_id: item.sourceId,
        p_content_text: item.contentText,
        p_content_header: item.contextHeader ?? undefined,
        p_embedding: embeddingStr,
        p_entity_ids: item.entityIds ?? [],
        p_metadata: (item.metadata ?? {}) as Json,
      });
      if (error) {
        console.error(
          `[aion/embeddings] RPC failed for ${item.sourceType}/${item.sourceId}:`,
          error.message,
        );
        outcomes[originalIdx] = { status: 'failed', stage: 'rpc', message: error.message };
      } else {
        outcomes[originalIdx] = { status: 'inserted' };
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[aion/embeddings] RPC threw for ${item.sourceType}/${item.sourceId}:`, message);
      outcomes[originalIdx] = { status: 'failed', stage: 'rpc', message };
    }
  }

  return outcomes as UpsertOutcome[];
}

/**
 * Single-item wrapper around {@link upsertEmbeddingBatch}. Kept for the
 * fire-and-forget live-write paths (deal notes, follow-up logs, proposals)
 * where the trigger is one record at a time.
 */
export async function upsertEmbedding(
  workspaceId: string,
  sourceType: SourceType,
  sourceId: string,
  contentText: string,
  contextHeader?: string | null,
  entityIds?: string[],
  metadata?: Record<string, unknown>,
): Promise<UpsertOutcome> {
  const [outcome] = await upsertEmbeddingBatch([{
    workspaceId,
    sourceType,
    sourceId,
    contentText,
    contextHeader,
    entityIds,
    metadata,
  }]);
  return outcome;
}

// ── Observability ────────────────────────────────────────────────────────────

/**
 * Attach failure-logging to a fire-and-forget upsert. Sprint 0 removed the
 * throw semantics from {@link upsertEmbedding}, so the old
 * `.catch(console.error)` pattern silently swallows every failure. This
 * helper inspects the returned {@link UpsertOutcome} and logs to console +
 * Sentry when the embed or RPC step failed.
 *
 * Why a helper: every live-write call site wants the same observation
 * discipline, and the alternatives (a) manually `.then(...)` at each site,
 * or (b) making `upsertEmbedding` throw again both proved worse — (a) is
 * copy-paste drift, (b) loses the per-item outcome shape that batched
 * ingestion needs.
 */
export function observeUpsert(
  p: Promise<UpsertOutcome>,
  ref: { sourceType: SourceType; sourceId: string },
): void {
  void p.then(async (outcome) => {
    if (outcome.status !== 'failed') return;
    console.error(
      `[aion/embeddings] upsert failed for ${ref.sourceType}/${ref.sourceId} @ ${outcome.stage}:`,
      outcome.message,
    );
    try {
      const Sentry = await import('@sentry/nextjs');
      Sentry.captureMessage(
        `upsertEmbedding failed: ${ref.sourceType}/${ref.sourceId}`,
        {
          level: 'warning',
          tags: {
            module: 'aion',
            action: 'upsertEmbedding',
            source_type: ref.sourceType,
            stage: outcome.stage,
          },
          extra: { sourceId: ref.sourceId, message: outcome.message },
        },
      );
    } catch {
      // Sentry optional — console.error above is sufficient locally.
    }
  }).catch((err) => {
    // Defence in depth — upsertEmbedding contract says it never rejects.
    console.error('[aion/embeddings] observeUpsert saw unexpected rejection:', err);
  });
}

// ── Queue enqueue (Week 2 ingestion) ────────────────────────────────────────

/**
 * Enqueue a row for eventual embedding via the 2-minute drain cron. Called
 * from the webhook paths (Postmark inbound, send-reply outbound) where we
 * don't want to block the 200 OK on Voyage latency.
 *
 * Header enrichment happens in the drain cron (joins deal + sender entity)
 * so the webhook call is a single RPC round-trip with no extra queries.
 *
 * Fire-and-forget at call sites: if the enqueue itself fails, we log it
 * but don't fail the webhook — an un-embedded message still lives in
 * ops.messages, so the deterministic `get_latest_messages` tool still
 * finds it; only the semantic `lookup_client_messages` path is impaired.
 *
 * Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.2 B2.
 */
export async function enqueueMessageEmbedding(args: {
  workspaceId: string;
  messageId: string;
  bodyText: string;
  channel: 'email' | 'sms' | 'call_note';
  direction: 'inbound' | 'outbound';
  providerMessageId?: string | null;
}): Promise<void> {
  if (!args.bodyText?.trim()) return;

  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();
    const { error } = await system
      .schema('cortex')
      .rpc('enqueue_memory_pending', {
        p_workspace_id: args.workspaceId,
        p_source_type: 'message',
        p_source_id: args.messageId,
        p_content_text: args.bodyText,
        p_content_header: undefined,
        p_entity_ids: [],
        p_metadata: {
          channel: args.channel,
          direction: args.direction,
          provider_message_id: args.providerMessageId ?? null,
        },
      });
    if (error) {
      console.error(
        `[aion/enqueue-message] enqueue failed for ${args.messageId}:`,
        error.message,
      );
    }
  } catch (err) {
    console.error(
      `[aion/enqueue-message] enqueue threw for ${args.messageId}:`,
      err instanceof Error ? err.message : err,
    );
  }
}

// ── Delete embedding ─────────────────────────────────────────────────────────

/**
 * Remove an embedding when the source content is deleted.
 * Fire-and-forget safe.
 */
export async function deleteEmbedding(
  sourceType: SourceType,
  sourceId: string,
): Promise<void> {
  try {
    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();

    await system.schema('cortex').rpc('delete_memory_embedding', {
      p_source_type: sourceType,
      p_source_id: sourceId,
    });
  } catch (err) {
    console.error(`[aion/embeddings] Failed to delete embedding for ${sourceType}/${sourceId}:`, err);
  }
}

// ── Search ───────────────────────────────────────────────────────────────────

export type MemorySearchResult = {
  id: string;
  content: string;
  header: string | null;
  sourceType: string;
  sourceId: string;
  metadata: Record<string, unknown>;
  similarity: number;
};

/**
 * Semantic search over workspace knowledge embeddings.
 * Embeds the query, calls cortex.match_memory RPC.
 */
export async function searchMemory(
  workspaceId: string,
  query: string,
  options?: {
    limit?: number;
    threshold?: number;
    sourceTypes?: SourceType[];
    entityIds?: string[];
  },
): Promise<MemorySearchResult[]> {
  try {
    const embedding = await embedContent(query);
    const embeddingStr = `[${embedding.join(',')}]`;

    const { createClient } = await import('@/shared/api/supabase/server');
    const supabase = await createClient();

    const { data, error } = await supabase.rpc('match_memory', {
      p_workspace_id: workspaceId,
      p_query_embedding: embeddingStr,
      p_match_count: options?.limit ?? 5,
      p_match_threshold: options?.threshold ?? 0.3,
      p_source_types: options?.sourceTypes ?? null,
      p_entity_ids: options?.entityIds ?? null,
    });

    if (error || !data) return [];

    type RawMatchRow = {
      id: string;
      content_text: string;
      content_header: string | null;
      source_type: string;
      source_id: string;
      metadata: Record<string, unknown> | null;
      similarity: number;
    };
    return (data as RawMatchRow[]).map((r) => ({
      id: r.id,
      content: r.content_text,
      header: r.content_header,
      sourceType: r.source_type,
      sourceId: r.source_id,
      metadata: r.metadata ?? {},
      similarity: r.similarity,
    }));
  } catch (err) {
    console.error('[aion/embeddings] Memory search failed:', err);
    return [];
  }
}
