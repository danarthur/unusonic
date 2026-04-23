/**
 * ai_summary backfill — Phase 3 Sprint 1 Week 3.
 *
 * Walks ops.messages rows WHERE ai_summary IS NULL AND body_text IS NOT NULL,
 * calls Haiku for a one-line paraphrase, and writes the result back via
 * SECURITY DEFINER RPC. Used by:
 *
 *   • Admin "ai_summary backfill" button in /settings/aion.
 *   • (Future) Post-embed enrichment step in the drain cron — so new
 *     inbound/outbound messages get a summary alongside their embedding.
 *
 * Pre-flight cost estimate is available via
 * `estimateAiSummaryBackfillCost()` so the admin can see the bill before
 * pressing run.
 */

'use server';

import { getSystemClient } from '@/shared/api/supabase/system';
import {
  summarizeMessage,
  summarizeMessageCostEstimate,
} from './summarize-message';

type MessageRow = {
  id: string;
  workspace_id: string;
  body_text: string;
  direction: 'inbound' | 'outbound';
  from_entity_id: string | null;
};

export type AiSummaryCostEstimate = {
  messageCount: number;
  avgBodyChars: number;
  inputTokens: number;
  outputTokens: number;
  usd: number;
};

export type AiSummaryBackfillResult = {
  attempted: number;
  summarized: number;
  skipped: number;
  failed: number;
  sampleFailures: Array<{ messageId: string; error: string }>;
};

const FAILURE_SAMPLE_CAP = 10;

/**
 * Pre-flight count + cost estimate for a workspace. Reads body_text so we
 * can compute the average length — that feeds the input-token estimate.
 * Cap the sample at 500 rows for the avg so a 10k-message workspace
 * doesn't stall the estimator.
 */
export async function estimateAiSummaryBackfillCost(
  workspaceId: string,
): Promise<AiSummaryCostEstimate> {
  const supabase = getSystemClient();

  const { count } = await supabase
    .schema('ops')
    .from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('workspace_id', workspaceId)
    .is('ai_summary', null)
    .not('body_text', 'is', null);

  const messageCount = count ?? 0;
  if (messageCount === 0) {
    return { messageCount: 0, avgBodyChars: 0, inputTokens: 0, outputTokens: 0, usd: 0 };
  }

  const { data: sample } = await supabase
    .schema('ops')
    .from('messages')
    .select('body_text')
    .eq('workspace_id', workspaceId)
    .is('ai_summary', null)
    .not('body_text', 'is', null)
    .limit(500);

  const sampleRows = ((sample ?? []) as Array<{ body_text: string | null }>).filter(
    (r): r is { body_text: string } => r.body_text !== null,
  );
  const totalChars = sampleRows.reduce((sum, r) => sum + r.body_text.length, 0);
  const avgBodyChars = sampleRows.length > 0 ? Math.round(totalChars / sampleRows.length) : 0;

  const est = summarizeMessageCostEstimate({ messageCount, avgBodyChars });
  return { messageCount, avgBodyChars, ...est };
}

/**
 * Run the backfill. Iterates eligible messages in batches, calls Haiku
 * sequentially (Anthropic's sustained-throughput rate limit is generous
 * for ~1 QPS), and writes ai_summary back via the service-role client.
 *
 * `cap` bounds how many rows get processed in a single call — use to
 * chunk a giant workspace over multiple invocations without timing out
 * the Vercel serverless function.
 */
export async function runAiSummaryBackfill(
  workspaceId: string,
  options: { cap?: number } = {},
): Promise<AiSummaryBackfillResult> {
  const supabase = getSystemClient();
  const result: AiSummaryBackfillResult = {
    attempted: 0,
    summarized: 0,
    skipped: 0,
    failed: 0,
    sampleFailures: [],
  };

  const cap = options.cap ?? 200;
  const { data: rows } = await supabase
    .schema('ops')
    .from('messages')
    .select('id, workspace_id, body_text, direction, from_entity_id')
    .eq('workspace_id', workspaceId)
    .is('ai_summary', null)
    .not('body_text', 'is', null)
    .order('created_at', { ascending: false })
    .limit(cap);

  const eligible = ((rows ?? []) as unknown) as MessageRow[];
  result.attempted = eligible.length;
  if (eligible.length === 0) return result;

  // Resolve sender names for the prompt — a single fetch for all distinct
  // from_entity_ids keeps the round-trip count O(1) not O(N).
  const fromEntityIds = [
    ...new Set(eligible.map((r) => r.from_entity_id).filter((x): x is string => x !== null)),
  ];
  const nameByEntityId = new Map<string, string>();
  if (fromEntityIds.length > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', fromEntityIds);
    for (const e of ((entities ?? []) as Array<{ id: string; display_name: string | null }>)) {
      if (e.display_name) nameByEntityId.set(e.id, e.display_name);
    }
  }

  for (const row of eligible) {
    const fromName = row.from_entity_id ? nameByEntityId.get(row.from_entity_id) ?? null : null;
    const summary = await summarizeMessage({
      bodyText: row.body_text,
      fromName,
      direction: row.direction,
    });

    if (!summary) {
      result.skipped++;
      continue;
    }

    const { error } = await supabase
      .schema('ops')
      .from('messages')
      .update({ ai_summary: summary })
      .eq('id', row.id)
      .eq('workspace_id', workspaceId);

    if (error) {
      result.failed++;
      if (result.sampleFailures.length < FAILURE_SAMPLE_CAP) {
        result.sampleFailures.push({ messageId: row.id, error: error.message });
      }
      continue;
    }

    result.summarized++;
  }

  return result;
}
