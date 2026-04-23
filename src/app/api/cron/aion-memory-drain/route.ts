/**
 * GET /api/cron/aion-memory-drain
 *
 * Drains cortex.memory_pending every 2 minutes (vercel.json). For each
 * claimed row:
 *   1. If source_type === 'message', enrich the header with deal title +
 *      client name + channel/direction/date before embedding.
 *   2. Batch-embed via upsertEmbeddingBatch (one Voyage round-trip per
 *      ≤96 rows).
 *   3. Call cortex.mark_memory_pending_result on each — 'success' deletes
 *      the queue row; 'failure' triggers exponential backoff.
 *
 * Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.2 B2.
 *
 * Auth: CRON_SECRET bearer token, matching the rest of the repo's cron
 * routes (e.g. /api/cron/follow-up-queue).
 */

import { NextResponse } from 'next/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import {
  buildContextHeader,
  upsertEmbeddingBatch,
  type EmbedItem,
  type SourceType,
} from '@/app/api/aion/lib/embeddings';

export const runtime = 'nodejs';
export const maxDuration = 60;

const CLAIM_LIMIT = 50;

type PendingRow = {
  id: string;
  workspace_id: string;
  source_type: SourceType;
  source_id: string;
  content_text: string;
  content_header: string | null;
  entity_ids: string[];
  metadata: Record<string, unknown>;
  attempts: number;
};

type MessageEnrichmentRow = {
  id: string;
  direction: 'inbound' | 'outbound';
  channel: 'email' | 'sms' | 'call_note';
  from_entity_id: string | null;
  created_at: string;
  thread: { deal_id: string | null } | null;
};

export async function GET(req: Request) {
  const expected = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization');
  if (!expected || auth !== `Bearer ${expected}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const supabase = getSystemClient();

  // 1. Claim batch of due rows. attempts is bumped up front in the RPC so
  //    a crash mid-handler still counts the attempt.
  //    RPCs not yet in generated types until migration 20260518000100 is applied.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: claimed, error: claimErr } = await (supabase as any)
    .schema('cortex')
    .rpc('claim_memory_pending_batch', { p_limit: CLAIM_LIMIT });

  if (claimErr) {
    console.error('[cron/aion-memory-drain] claim failed:', claimErr.message);
    return NextResponse.json({ error: 'Claim failed' }, { status: 500 });
  }

  const rows = ((claimed ?? []) as unknown) as PendingRow[];
  if (rows.length === 0) {
    return NextResponse.json({ claimed: 0, processed: 0 });
  }

  // 2. Enrich message rows with deal title + client name for the header.
  //    Non-message rows keep their existing (possibly null) content_header.
  const enriched = await enrichItems(supabase, rows);

  // 3. Batched embed — one Voyage round-trip per chunk of 96.
  const outcomes = await upsertEmbeddingBatch(enriched);

  // 4. Report result back to the queue.
  let successes = 0;
  let failures = 0;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cortex = (supabase as any).schema('cortex');
  await Promise.all(
    outcomes.map((outcome, i) => {
      const row = rows[i];
      if (outcome.status === 'inserted' || outcome.status === 'skipped') {
        // Empty content is idempotent-successful — don't keep retrying.
        successes++;
        return cortex.rpc('mark_memory_pending_result', {
          p_id: row.id,
          p_status: 'success',
          p_error: null,
        });
      }
      failures++;
      return cortex.rpc('mark_memory_pending_result', {
        p_id: row.id,
        p_status: 'failure',
        p_error: `${outcome.stage}: ${outcome.message}`.slice(0, 500),
      });
    }),
  );

  console.log(
    `[cron/aion-memory-drain] claimed=${rows.length} successes=${successes} failures=${failures}`,
  );

  return NextResponse.json({
    claimed: rows.length,
    processed: successes + failures,
    successes,
    failures,
  });
}

/**
 * Enrich queue rows into EmbedItem payloads ready for upsertEmbeddingBatch.
 * Message rows get a header built from deal title + sender name + channel;
 * all other source types pass through with their enqueue-time header.
 *
 * Two batched fetches: one for message rows (with the joined thread) and
 * one for sender entity display names. Other source types require no
 * extra I/O.
 */
async function enrichItems(
  supabase: ReturnType<typeof getSystemClient>,
  rows: PendingRow[],
): Promise<EmbedItem[]> {
  const messageRows = rows.filter((r) => r.source_type === 'message');
  const messageIds = messageRows.map((r) => r.source_id);

  const enrichmentByMessageId = new Map<string, MessageEnrichmentRow>();
  const entityIdsToResolve = new Set<string>();
  const dealIdsToResolve = new Set<string>();

  if (messageIds.length > 0) {
    const { data: msgs } = await supabase
      .schema('ops')
      .from('messages')
      .select(
        'id, direction, channel, from_entity_id, created_at, ' +
        'thread:message_threads!inner(deal_id)',
      )
      .in('id', messageIds);

    for (const m of ((msgs ?? []) as unknown as MessageEnrichmentRow[])) {
      enrichmentByMessageId.set(m.id, m);
      if (m.from_entity_id) entityIdsToResolve.add(m.from_entity_id);
      if (m.thread?.deal_id) dealIdsToResolve.add(m.thread.deal_id);
    }
  }

  const entityNameById = new Map<string, string>();
  if (entityIdsToResolve.size > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', [...entityIdsToResolve]);
    for (const e of (entities ?? []) as Array<{ id: string; display_name: string | null }>) {
      if (e.display_name) entityNameById.set(e.id, e.display_name);
    }
  }

  const dealTitleById = new Map<string, string>();
  if (dealIdsToResolve.size > 0) {
    const { data: deals } = await supabase
      .from('deals')
      .select('id, title')
      .in('id', [...dealIdsToResolve]);
    for (const d of (deals ?? []) as Array<{ id: string; title: string | null }>) {
      if (d.title) dealTitleById.set(d.id, d.title);
    }
  }

  return rows.map((r) => {
    const entityIds = [...r.entity_ids];
    let header = r.content_header;

    if (r.source_type === 'message') {
      const enrichment = enrichmentByMessageId.get(r.source_id);
      if (enrichment) {
        const clientName = enrichment.from_entity_id
          ? entityNameById.get(enrichment.from_entity_id) ?? null
          : null;
        const dealTitle = enrichment.thread?.deal_id
          ? dealTitleById.get(enrichment.thread.deal_id) ?? null
          : null;
        header = buildContextHeader('message', {
          dealTitle,
          clientName,
          channel: enrichment.channel,
          direction: enrichment.direction,
          date: enrichment.created_at.slice(0, 10),
        });
        // Ensure the sender entity is part of the vector's entity_ids so
        // Aion tools can filter by person when querying messages.
        if (enrichment.from_entity_id && !entityIds.includes(enrichment.from_entity_id)) {
          entityIds.push(enrichment.from_entity_id);
        }
      }
    }

    return {
      workspaceId: r.workspace_id,
      sourceType: r.source_type,
      sourceId: r.source_id,
      contentText: r.content_text,
      contextHeader: header,
      entityIds,
      metadata: r.metadata,
    };
  });
}
