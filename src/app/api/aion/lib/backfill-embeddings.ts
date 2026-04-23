/**
 * Backfill embeddings for existing workspace content.
 *
 * Collects deal notes, follow-up logs, proposals, and catalog packages into
 * one flat list and sends them through {@link upsertEmbeddingBatch}, which
 * batches up to 96 items per Voyage call. All four source types land in
 * cortex.memory after the Phase 3 Sprint 1 catalog consolidation (migration
 * 20260517000200).
 */

'use server';

import { createClient } from '@/shared/api/supabase/server';
import {
  upsertEmbeddingBatch,
  buildContextHeader,
  type EmbedItem,
  type UpsertOutcome,
  type SourceType,
} from './embeddings';

export type BackfillSourceTally = {
  attempted: number;
  inserted: number;
  skipped: number;
  failed: number;
};

export type BackfillFailureSample = {
  sourceType: string;
  sourceId: string;
  stage: 'embed' | 'rpc';
  message: string;
};

export type BackfillResult = {
  dealNotes: BackfillSourceTally;
  followUpLogs: BackfillSourceTally;
  proposals: BackfillSourceTally;
  catalogPackages: BackfillSourceTally;
  firstFailures: BackfillFailureSample[];
};

const FAILURE_SAMPLE_CAP = 10;

function emptyTally(): BackfillSourceTally {
  return { attempted: 0, inserted: 0, skipped: 0, failed: 0 };
}

export async function backfillWorkspaceContentEmbeddings(
  workspaceId: string,
): Promise<BackfillResult> {
  const supabase = await createClient();
  const result: BackfillResult = {
    dealNotes: emptyTally(),
    followUpLogs: emptyTally(),
    proposals: emptyTally(),
    catalogPackages: emptyTally(),
    firstFailures: [],
  };

  const recordFailure = (s: BackfillFailureSample) => {
    if (result.firstFailures.length < FAILURE_SAMPLE_CAP) {
      result.firstFailures.push(s);
    }
  };

  // ── Collect deal notes ──────────────────────────────────────────────────

  const { data: notes } = await supabase
    .schema('ops')
    .from('deal_notes')
    .select('id, deal_id, content')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  const noteDealMap = await buildDealTitleMap(supabase, notes ?? []);

  const noteItems: EmbedItem[] = (notes ?? []).map((n: any) => ({
    workspaceId,
    sourceType: 'deal_note' as SourceType,
    sourceId: n.id,
    contentText: n.content ?? '',
    contextHeader: buildContextHeader('deal_note', {
      dealTitle: noteDealMap.get(n.deal_id) ?? null,
    }),
  }));
  result.dealNotes.attempted = noteItems.length;

  // ── Collect follow-up logs ──────────────────────────────────────────────

  const { data: logs } = await supabase
    .schema('ops')
    .from('follow_up_log')
    .select('id, deal_id, content, summary, channel')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  const logDealMap = await buildDealTitleMap(supabase, logs ?? []);

  const logItems: EmbedItem[] = (logs ?? []).map((l: any) => ({
    workspaceId,
    sourceType: 'follow_up' as SourceType,
    sourceId: l.id,
    contentText: l.content || l.summary || '',
    contextHeader: buildContextHeader('follow_up', {
      dealTitle: logDealMap.get(l.deal_id) ?? null,
      channel: l.channel,
    }),
  }));
  result.followUpLogs.attempted = logItems.length;

  // ── Collect proposals ───────────────────────────────────────────────────

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id, scope_notes, payment_notes')
    .eq('workspace_id', workspaceId);

  const proposalDealMap = await buildDealTitleMap(supabase, proposals ?? []);

  const proposalItems: EmbedItem[] = (proposals ?? []).map((p: any) => {
    const parts = [p.scope_notes, p.payment_notes].filter(Boolean);
    return {
      workspaceId,
      sourceType: 'proposal' as SourceType,
      sourceId: p.id,
      contentText: parts.join('\n\n'),
      contextHeader: buildContextHeader('proposal', {
        dealTitle: proposalDealMap.get(p.deal_id) ?? null,
      }),
    };
  });
  result.proposals.attempted = proposalItems.length;

  // ── Collect catalog packages ───────────────────────────────────────────

  const { data: pkgs } = await supabase
    .from('packages')
    .select('id, name, description, category')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true);

  const pkgRows = (pkgs ?? []) as Array<{
    id: string;
    name: string;
    description: string | null;
    category: string;
  }>;

  const { data: tagRows } = pkgRows.length > 0
    ? await supabase
        .from('package_tags')
        .select('package_id, workspace_tags(label)')
        .in('package_id', pkgRows.map((p) => p.id))
    : { data: null };

  type PackageTagRow = {
    package_id: string;
    workspace_tags: { label: string } | { label: string }[] | null;
  };

  const typedTagRows = (tagRows ?? []) as PackageTagRow[];

  const catalogItems: EmbedItem[] = pkgRows.map((pkg) => {
    const tags = typedTagRows
      .filter((r) => r.package_id === pkg.id)
      .map((r) => {
        const wt = r.workspace_tags;
        if (Array.isArray(wt)) return wt[0]?.label;
        return wt?.label;
      })
      .filter(Boolean) as string[];

    const bodyParts = [
      pkg.name,
      pkg.description ?? '',
      `Category: ${pkg.category.replace(/_/g, ' ')}`,
      ...tags,
    ];

    return {
      workspaceId,
      sourceType: 'catalog' as SourceType,
      sourceId: pkg.id,
      contentText: bodyParts.filter(Boolean).join(' ').trim(),
      contextHeader: buildContextHeader('catalog', {
        packageName: pkg.name,
        packageCategory: pkg.category,
      }),
    };
  });
  result.catalogPackages.attempted = catalogItems.length;

  // ── Single batched run across all four source types ────────────────────

  const all: EmbedItem[] = [...noteItems, ...logItems, ...proposalItems, ...catalogItems];
  const outcomes = await upsertEmbeddingBatch(all);

  const tallyFor = (source: SourceType): BackfillSourceTally => {
    switch (source) {
      case 'deal_note': return result.dealNotes;
      case 'follow_up': return result.followUpLogs;
      case 'proposal': return result.proposals;
      case 'catalog': return result.catalogPackages;
      default: throw new Error(`unexpected source ${source}`);
    }
  };

  for (let i = 0; i < all.length; i++) {
    const item = all[i];
    const outcome = outcomes[i];
    const tally = tallyFor(item.sourceType);
    applyOutcome(tally, outcome, item, recordFailure);
  }

  return result;
}

function applyOutcome(
  tally: BackfillSourceTally,
  outcome: UpsertOutcome,
  item: EmbedItem,
  recordFailure: (s: BackfillFailureSample) => void,
) {
  if (outcome.status === 'inserted') tally.inserted++;
  else if (outcome.status === 'skipped') tally.skipped++;
  else {
    tally.failed++;
    recordFailure({
      sourceType: item.sourceType,
      sourceId: item.sourceId,
      stage: outcome.stage,
      message: outcome.message,
    });
  }
}

async function buildDealTitleMap(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: Array<{ deal_id: string | null }>,
): Promise<Map<string, string>> {
  const ids = [...new Set(rows.map((r) => r.deal_id).filter(Boolean) as string[])];
  if (ids.length === 0) return new Map();
  const { data: deals } = await supabase.from('deals').select('id, title').in('id', ids);
  return new Map((deals ?? []).map((d: any) => [d.id as string, (d.title as string) ?? '']));
}
