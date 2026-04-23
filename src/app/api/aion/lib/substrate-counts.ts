/**
 * Substrate counts — per-workspace inventory totals for retrieval envelopes.
 *
 * Every retrieval tool handler calls `getSubstrateCounts(workspaceId)` at exit
 * and merges the result into its envelope (§3.13(a) "name the substrate,
 * every time"). The RPC `cortex.substrate_counts` runs workspace-member
 * auth + six count queries in one round-trip.
 *
 * Memoization: keyed by (workspace_id, window_days). One POST /api/aion/chat
 * request can trigger 3+ tool calls in a single turn — the memo keeps that
 * to a single DB round-trip per unique (workspace, window) combination. The
 * memo is backed by a module-level Map with a short TTL so stale counts
 * don't linger across requests in the same process.
 *
 * Window: defaults to 90 days to match the Phase 3 ingest horizon (message
 * backfill + activity-log chunker). Callers can override.
 */

import { createClient } from '@/shared/api/supabase/server';
import type { SubstrateCounts } from './retrieval-envelope';

const DEFAULT_WINDOW_DAYS = 90;
const MEMO_TTL_MS = 15_000;

type MemoEntry = {
  promise: Promise<SubstrateCounts>;
  expiresAt: number;
};

const memo = new Map<string, MemoEntry>();

function memoKey(workspaceId: string, windowDays: number): string {
  return `${workspaceId}:${windowDays}`;
}

/**
 * Fallback returned when the RPC fails or a caller lacks workspace membership.
 * Retrieval handlers should still render their result; the envelope's
 * `searched` surface simply reports zero-inventory. System prompt copes.
 */
export const EMPTY_SUBSTRATE: SubstrateCounts = {
  deals: 0,
  entities: 0,
  messages_in_window: 0,
  notes: 0,
  catalog_items: 0,
  memory_chunks: 0,
};

export async function getSubstrateCounts(
  workspaceId: string,
  windowDays: number = DEFAULT_WINDOW_DAYS,
): Promise<SubstrateCounts> {
  const key = memoKey(workspaceId, windowDays);
  const now = Date.now();

  const cached = memo.get(key);
  if (cached && cached.expiresAt > now) {
    return cached.promise;
  }

  const fetchPromise = fetchCounts(workspaceId, windowDays);
  memo.set(key, { promise: fetchPromise, expiresAt: now + MEMO_TTL_MS });

  try {
    return await fetchPromise;
  } catch {
    memo.delete(key);
    return EMPTY_SUBSTRATE;
  }
}

async function fetchCounts(
  workspaceId: string,
  windowDays: number,
): Promise<SubstrateCounts> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('cortex')
    .rpc('substrate_counts', {
      p_workspace_id: workspaceId,
      p_window_days: windowDays,
    });

  if (error || !data || data.length === 0) {
    console.warn(
      `[aion.substrate_counts] workspace=${workspaceId} window=${windowDays} error=${error?.message ?? 'empty'}`,
    );
    return EMPTY_SUBSTRATE;
  }

  const row = data[0];
  return {
    deals:              Number(row.deals              ?? 0),
    entities:           Number(row.entities           ?? 0),
    messages_in_window: Number(row.messages_in_window ?? 0),
    notes:              Number(row.notes              ?? 0),
    catalog_items:      Number(row.catalog_items      ?? 0),
    memory_chunks:      Number(row.memory_chunks      ?? 0),
  };
}
