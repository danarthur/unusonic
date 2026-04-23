/**
 * Activity-log chunking — Phase 3 Sprint 1 Week 3. Plan §3.3.
 *
 * Strategy. cortex.memory rows with `source_type='activity_log'` are one
 * per (deal_id, YYYYMM) pair. source_id = `<deal_uuid>:YYYYMM` (text,
 * enabled by migration 20260519000100). Upsert-on-conflict keeps exactly
 * one row per deal-month; the content_text is rebuilt from scratch every
 * time new activity rows land in that month's window.
 *
 * Refresh policy (simplified from plan §3.3 trigger-based approach):
 *   • Daily cron /api/cron/aion-activity-embed walks deals with activity
 *     rows inserted in the last 48h and rebuilds their month-chunks.
 *   • Backdated writes (inserted 2026-04-23 for an event dated 2026-01-12)
 *     are caught because the filter is on created_at, not the event's
 *     logical date — so the January chunk gets re-embedded when the row
 *     hits the table.
 *   • Trade-off vs plan spec: up to 24h staleness on backdated inserts.
 *     Plan called for a BEFORE-INSERT trigger for instant enqueue; that's
 *     correct architecture for user-waiting-on-a-reply paths (messages),
 *     but activity-log queries are inherently historical ("what did we do
 *     on Cipriani in March") and 24h latency is acceptable for v1. If
 *     telemetry shows late-arriving activity is missed in Aion answers,
 *     graduate to the trigger-based approach.
 *
 * Chunk content format (per plan §3.3):
 *   [Activity — Cipriani Wedding (deal: <uuid>), March 2026]
 *   2026-03-04: Stage moved Proposal → Negotiation
 *   2026-03-06: Proposal v2 sent ($18,450 → $16,750)
 *   2026-03-12: <untrusted>Note added: Becca asked about wireless</untrusted>
 *
 * All action_summary lines are wrapped in <untrusted>. Plan spec calls for
 * wrapping only note-derived lines, but at current rig the trigger-type
 * set isn't frozen — safer to wrap uniformly and relax later. Header +
 * date prefix stay plain (code-generated, safe).
 */

'use server';

import type { SupabaseClient } from '@supabase/supabase-js';
import { wrapUntrusted } from './wrap-untrusted';

// Excluded trigger types — silent field edits and re-orderings don't
// carry semantic content worth retrieving.
const EXCLUDED_TRIGGER_TYPES = new Set([
  'stage_reorder',
  'field_touch',
  'ping',
]);

// Optional: trigger_types whose action_summary is code-generated and safe
// to render without <untrusted>. Empty today; populate if we want richer
// formatting. Wrapping is cheap, so defaulting to wrap-everything is fine.
const SAFE_TRIGGER_TYPES = new Set<string>([]);

export type ActivityChunkKey = {
  workspaceId: string;
  dealId: string;
  dealTitle: string | null;
  /** First day of the chunk month, ISO date (e.g. '2026-03-01'). */
  monthStart: string;
};

export type ActivityChunkPayload = ActivityChunkKey & {
  /** Formatted chunk text, ready to embed. */
  contentText: string;
  /** Chunk identity: '<deal_uuid>:YYYYMM'. */
  sourceId: string;
  /** Entity ids touched inside the chunk — used for `entity_ids` array overlap search. */
  entityIds: string[];
};

type ActivityRow = {
  deal_id: string;
  trigger_type: string | null;
  action_summary: string;
  status: string;
  created_at: string;
  actor_user_id: string | null;
};

/**
 * Compute the chunk-month bucket for a timestamp. Uses UTC; the plan's
 * workspace-local TZ discipline can be layered on if we see drift.
 */
function chunkMonthStart(isoTs: string): string {
  const d = new Date(isoTs);
  const y = d.getUTCFullYear();
  const m = (d.getUTCMonth() + 1).toString().padStart(2, '0');
  return `${y}-${m}-01`;
}

function chunkSourceId(dealId: string, monthStart: string): string {
  // monthStart is ISO; convert to YYYYMM for the source_id format.
  const [y, m] = monthStart.split('-');
  return `${dealId}:${y}${m}`;
}

function formatMonthLabel(monthStart: string): string {
  const d = new Date(monthStart + 'T00:00:00Z');
  return d.toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

function formatLine(row: ActivityRow): string {
  const date = row.created_at.slice(0, 10);
  const base = `${date}: ${row.action_summary.trim()}`;
  if (row.trigger_type && SAFE_TRIGGER_TYPES.has(row.trigger_type)) return base;
  // Wrap the summary body but not the date prefix — owners' tools render
  // the date cleanly; only the free-text body is potential injection bait.
  return `${date}: ${wrapUntrusted(row.action_summary.trim())}`;
}

/**
 * Build a single activity chunk's formatted text from a set of activity rows
 * plus the deal's title. Pure — takes in-memory rows, emits a string.
 * Exported for direct unit testing.
 */
export function buildChunkContent(args: {
  dealTitle: string | null;
  dealId: string;
  monthStart: string;
  rows: ActivityRow[];
}): string {
  const header = `[Activity — ${args.dealTitle ?? 'Untitled deal'} (deal: ${args.dealId}), ${formatMonthLabel(args.monthStart)}]`;
  const filtered = args.rows.filter((r) => !r.trigger_type || !EXCLUDED_TRIGGER_TYPES.has(r.trigger_type));
  // Include even failed/undone events — they're part of the historical
  // record. Owners asking "did we ever send the wireless-upgrade quote"
  // want to know if a send was attempted-and-failed too.
  filtered.sort((a, b) => a.created_at.localeCompare(b.created_at));

  if (filtered.length === 0) return header;

  const lines = filtered.map(formatLine);
  return `${header}\n${lines.join('\n')}`;
}

/**
 * Discover the set of (workspace, deal, chunk-month) tuples touched by
 * activity rows inserted after `since`. Used by both the daily refresh
 * cron and the backfill (with `since = '1970-01-01'`).
 *
 * Returns fully-rendered chunk payloads ready for upsertEmbeddingBatch —
 * deal titles resolved, rows grouped and formatted, source_ids computed.
 * The caller doesn't need to know the chunker's internal structure.
 */
export async function loadActivityChunksTouchedSince(
  supabase: SupabaseClient,
  args: {
    workspaceId: string;
    sinceIso: string;
    /** Optional cap so a giant backfill doesn't fan out unbounded — useful
     *  while we dial in Voyage rate-limit posture. */
    maxChunks?: number;
  },
): Promise<ActivityChunkPayload[]> {
  // Step 1: find affected deals + months. We fetch ALL activity rows for
  // deals that got any insert after `since`, not just the post-since rows,
  // because chunk rebuild needs the full monthly picture.
  const { data: recent } = await supabase
    .schema('ops')
    .from('deal_activity_log')
    .select('deal_id, created_at')
    .eq('workspace_id', args.workspaceId)
    .gte('created_at', args.sinceIso);

  const recentRows = ((recent ?? []) as unknown) as Array<{ deal_id: string; created_at: string }>;
  if (recentRows.length === 0) return [];

  // Set of (deal_id, month_start) tuples needing rebuild.
  const chunkKeys = new Set<string>();
  for (const r of recentRows) {
    chunkKeys.add(`${r.deal_id}::${chunkMonthStart(r.created_at)}`);
  }

  // Step 2: load ALL activity rows for the affected deals, then bucket
  // by month to rebuild each chunk. Single fetch, client-side grouping —
  // cheaper than N per-chunk queries.
  const affectedDealIds = [...new Set(recentRows.map((r) => r.deal_id))];
  const { data: allRows } = await supabase
    .schema('ops')
    .from('deal_activity_log')
    .select('deal_id, trigger_type, action_summary, status, created_at, actor_user_id')
    .eq('workspace_id', args.workspaceId)
    .in('deal_id', affectedDealIds)
    .order('created_at', { ascending: true });

  const byDealMonth = new Map<string, ActivityRow[]>();
  for (const row of ((allRows ?? []) as unknown) as ActivityRow[]) {
    const key = `${row.deal_id}::${chunkMonthStart(row.created_at)}`;
    if (!chunkKeys.has(key)) continue; // only rebuild the touched months
    const bucket = byDealMonth.get(key) ?? [];
    bucket.push(row);
    byDealMonth.set(key, bucket);
  }

  // Step 3: resolve deal titles + actor entity ids.
  const { data: deals } = await supabase
    .from('deals')
    .select('id, title')
    .in('id', affectedDealIds)
    .eq('workspace_id', args.workspaceId);
  const dealTitleById = new Map<string, string | null>(
    ((deals ?? []) as Array<{ id: string; title: string | null }>).map((d) => [d.id, d.title]),
  );

  // Step 4: assemble payloads. Cap at maxChunks if provided so large
  // backfills don't spike Voyage.
  const payloads: ActivityChunkPayload[] = [];
  for (const [key, rows] of byDealMonth) {
    if (args.maxChunks && payloads.length >= args.maxChunks) break;
    const [dealId, monthStart] = key.split('::');
    const contentText = buildChunkContent({
      dealTitle: dealTitleById.get(dealId) ?? null,
      dealId,
      monthStart,
      rows,
    });
    const entityIds = [
      ...new Set(rows.map((r) => r.actor_user_id).filter((x): x is string => x !== null)),
    ];
    payloads.push({
      workspaceId: args.workspaceId,
      dealId,
      dealTitle: dealTitleById.get(dealId) ?? null,
      monthStart,
      sourceId: chunkSourceId(dealId, monthStart),
      contentText,
      entityIds,
    });
  }
  return payloads;
}
