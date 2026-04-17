/**
 * Aion Embedding Utilities
 *
 * Shared functions for generating, storing, and searching vector embeddings.
 * Follows the proven pattern from catalog-embeddings.ts.
 *
 * Uses Voyage AI voyage-3 (1024d) via the Vercel AI SDK.
 * Writes to cortex.memory via SECURITY DEFINER RPCs.
 */

import { embed } from 'ai';
import { createVoyage } from 'voyage-ai-provider';
import type { Json } from '@/types/supabase';

const voyage = createVoyage({ apiKey: process.env.VOYAGE_API_KEY! });

// ── Types ────────────────────────────────────────────────────────────────────

export type SourceType = 'deal_note' | 'follow_up' | 'proposal' | 'event_note' | 'capture';

export type ContextHeaderInput = {
  dealTitle?: string | null;
  clientName?: string | null;
  eventTitle?: string | null;
  entityName?: string | null;
  date?: string | null;
  channel?: string | null;
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
  }

  if (input.date) parts.push(`from ${input.date}`);

  return parts.join(' ') + '.';
}

// ── Upsert embedding ─────────────────────────────────────────────────────────

/**
 * Generate an embedding for content and upsert it into cortex.memory.
 * Fire-and-forget safe — logs errors but does not throw.
 *
 * Uses the system client (SECURITY DEFINER RPC) to bypass RLS for writes.
 */
export async function upsertEmbedding(
  workspaceId: string,
  sourceType: SourceType,
  sourceId: string,
  contentText: string,
  contextHeader?: string | null,
  entityIds?: string[],
  metadata?: Record<string, unknown>,
): Promise<void> {
  // Skip empty content
  if (!contentText.trim()) return;

  try {
    const embedding = await embedContent(contentText, contextHeader);
    const embeddingStr = `[${embedding.join(',')}]`;

    const { getSystemClient } = await import('@/shared/api/supabase/system');
    const system = getSystemClient();

    await system.schema('cortex').rpc('upsert_memory_embedding', {
      p_workspace_id: workspaceId,
      p_source_type: sourceType,
      p_source_id: sourceId,
      p_content_text: contentText,
      // RPC signature expects `undefined` not `null` for optional params
      p_content_header: contextHeader ?? undefined,
      p_embedding: embeddingStr,
      p_entity_ids: entityIds ?? [],
      // Cast through Json: the typed signature narrows to `Json` but metadata
      // is typed as `Record<string, unknown>` in upstream callers
      p_metadata: (metadata ?? {}) as Json,
    });
  } catch (err) {
    console.error(`[aion/embeddings] Failed to upsert embedding for ${sourceType}/${sourceId}:`, err);
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
