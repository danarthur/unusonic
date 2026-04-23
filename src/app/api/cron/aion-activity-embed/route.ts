/**
 * GET /api/cron/aion-activity-embed
 *
 * Daily sweep of deal_activity_log → cortex.memory activity-log chunks.
 * For each workspace, find deals that had any activity row inserted in
 * the last 48h, rebuild the (deal, YYYYMM) chunks for those months, and
 * embed the content via upsertEmbeddingBatch.
 *
 * 48h look-back (vs a strict 24h) is deliberate cushion — if a previous
 * run missed a workspace due to cron skew or transient error, the next
 * run catches the gap without needing an explicit recovery pass.
 *
 * Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.3.
 *
 * Auth: CRON_SECRET bearer.
 * Vercel schedule: 0 3 * * * (03:00 UTC).
 */

import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import {
  buildContextHeader,
  upsertEmbeddingBatch,
  type EmbedItem,
  type SourceType,
} from '@/app/api/aion/lib/embeddings';
import { loadActivityChunksTouchedSince } from '@/app/api/aion/lib/activity-chunker';

export const runtime = 'nodejs';
export const maxDuration = 300;

const LOOKBACK_HOURS = 48;
const MAX_CHUNKS_PER_WORKSPACE = 500;

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSystemClient();
  const since = new Date(Date.now() - LOOKBACK_HOURS * 60 * 60 * 1000).toISOString();

  // Workspaces that had any activity row in the window. We could iterate
  // all workspaces, but filtering up front keeps the sweep O(active) not
  // O(all).
  const { data: activeWs } = await supabase
    .schema('ops')
    .from('deal_activity_log')
    .select('workspace_id')
    .gte('created_at', since);

  const workspaceIds = [
    ...new Set(((activeWs ?? []) as Array<{ workspace_id: string }>).map((r) => r.workspace_id)),
  ];

  if (workspaceIds.length === 0) {
    return NextResponse.json({ workspaces: 0, chunks: 0, embedded: 0, failed: 0 });
  }

  let totalChunks = 0;
  let embedded = 0;
  let failed = 0;

  for (const workspaceId of workspaceIds) {
    const chunks = await loadActivityChunksTouchedSince(supabase, {
      workspaceId,
      sinceIso: since,
      maxChunks: MAX_CHUNKS_PER_WORKSPACE,
    });
    if (chunks.length === 0) continue;

    const items: EmbedItem[] = chunks.map((c) => ({
      workspaceId: c.workspaceId,
      sourceType: 'activity_log' as SourceType,
      sourceId: c.sourceId,
      contentText: c.contentText,
      contextHeader: buildContextHeader('activity_log', {
        dealTitle: c.dealTitle,
        monthLabel: c.monthStart,
      }),
      entityIds: c.entityIds,
      metadata: { deal_id: c.dealId, month: c.monthStart },
    }));

    totalChunks += items.length;
    const outcomes = await upsertEmbeddingBatch(items);
    for (const o of outcomes) {
      if (o.status === 'inserted') embedded++;
      else if (o.status === 'failed') failed++;
    }
  }

  console.log(
    `[cron/aion-activity-embed] workspaces=${workspaceIds.length} chunks=${totalChunks} embedded=${embedded} failed=${failed}`,
  );

  return NextResponse.json({
    workspaces: workspaceIds.length,
    chunks: totalChunks,
    embedded,
    failed,
  });
}
