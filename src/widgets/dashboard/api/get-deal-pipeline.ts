'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ── Types ──────────────────────────────────────────────────────────────────

export type PipelineStage = {
  status: string;  // stage slug; kept named "status" for API back-compat
  label: string;
  count: number;
  totalValue: number; // cents
};

export type DealPipelineDTO = {
  stages: PipelineStage[];
  totalWeightedValue: number; // cents
  totalDeals: number;
};

// ── Constants ──────────────────────────────────────────────────────────────

/**
 * Deal-value weighting for weighted-pipeline forecasting, keyed by stage slug.
 * Phase 2b: workspaces all use the default 7-slug pipeline, so slug-keyed is
 * safe. When custom stages ship in Phase 2d, weight will move onto
 * ops.pipeline_stages as a schema column. Unknown slugs fall back to 0.5.
 */
const STAGE_WEIGHTS: Record<string, number> = {
  inquiry: 0.1,
  proposal: 0.25,
  contract_sent: 0.4,
  contract_signed: 0.6,
  deposit_received: 0.8,
  won: 0.95,
};
const DEFAULT_WEIGHT = 0.5;

const EMPTY: DealPipelineDTO = { stages: [], totalWeightedValue: 0, totalDeals: 0 };

// ── Action ─────────────────────────────────────────────────────────────────

export async function getDealPipeline(): Promise<DealPipelineDTO> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();

  // 1. Fetch the workspace's default pipeline's stages (for ordering + labels)
  const { data: pipeline } = await supabase
    .schema('ops')
    .from('pipelines')
    .select('id, pipeline_stages(id, slug, label, sort_order, kind, is_archived)')
    .eq('workspace_id', workspaceId)
    .eq('is_default', true)
    .eq('is_archived', false)
    .maybeSingle();

  if (!pipeline) return EMPTY;

  type StageRow = { id: string; slug: string; label: string; sort_order: number; kind: string; is_archived: boolean };
  const stageRows = ((pipeline as { pipeline_stages?: StageRow[] }).pipeline_stages ?? [])
    .filter((s) => !s.is_archived)
    .sort((a, b) => a.sort_order - b.sort_order);

  if (stageRows.length === 0) return EMPTY;

  const stageById = new Map(stageRows.map((s) => [s.id, s]));

  // 2. Fetch all active deals, scoped by workspace
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, stage_id, status, budget_estimated')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null);

  if (dealsError || !deals?.length) return EMPTY;

  // Exclude lost deals; they don't belong on the pipeline widget
  const pipelineDeals = deals.filter((d) => {
    const stage = d.stage_id ? stageById.get(d.stage_id) : null;
    if (stage) return stage.kind !== 'lost';
    // Fallback for any unsynced deal: status-based exclusion
    return d.status !== 'lost';
  });

  if (pipelineDeals.length === 0) return EMPTY;

  // 3. Fetch proposal item totals for these deals
  const dealIds = pipelineDeals.map((d) => d.id);

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id')
    .in('deal_id', dealIds)
    .neq('status', 'draft');

  const proposalDealMap = new Map<string, string>();
  for (const p of proposals ?? []) {
    if (!proposalDealMap.has(p.id)) proposalDealMap.set(p.id, p.deal_id);
  }

  const proposalIds = [...proposalDealMap.keys()];
  const dealValueMap = new Map<string, number>();

  if (proposalIds.length > 0) {
    const { data: items } = await supabase
      .from('proposal_items')
      .select('proposal_id, quantity, unit_price, override_price, is_optional, unit_multiplier')
      .in('proposal_id', proposalIds);

    for (const item of items ?? []) {
      if (item.is_optional) continue;
      const dealId = proposalDealMap.get(item.proposal_id);
      if (!dealId) continue;
      const price = item.override_price ?? item.unit_price ?? 0;
      const qty = item.quantity ?? 1;
      const multiplier = item.unit_multiplier ?? 1;
      const lineTotal = price * qty * multiplier;
      dealValueMap.set(dealId, (dealValueMap.get(dealId) ?? 0) + lineTotal);
    }
  }

  // 4. Aggregate by stage_id (fallback: match status to stage slug)
  const stageBuckets = new Map<string, { count: number; totalValue: number }>();

  for (const deal of pipelineDeals) {
    let stageId = deal.stage_id as string | null;
    if (!stageId) {
      const match = stageRows.find((s) => s.slug === (deal.status ?? 'inquiry'));
      stageId = match?.id ?? null;
    }
    if (!stageId) continue;

    const bucket = stageBuckets.get(stageId) ?? { count: 0, totalValue: 0 };
    bucket.count += 1;
    const value = dealValueMap.get(deal.id) ?? deal.budget_estimated ?? 0;
    bucket.totalValue += value;
    stageBuckets.set(stageId, bucket);
  }

  // 5. Build ordered stages and compute weighted total.
  //    Skip kind='lost' stages (not shown on pipeline widget).
  let totalWeightedValue = 0;

  const stages: PipelineStage[] = stageRows
    .filter((s) => s.kind !== 'lost')
    .map((s) => {
      const bucket = stageBuckets.get(s.id) ?? { count: 0, totalValue: 0 };
      const weight = STAGE_WEIGHTS[s.slug] ?? DEFAULT_WEIGHT;
      totalWeightedValue += Math.round(bucket.totalValue * weight);
      return {
        status: s.slug,
        label: s.label,
        count: bucket.count,
        totalValue: bucket.totalValue,
      };
    });

  return {
    stages,
    totalWeightedValue,
    totalDeals: pipelineDeals.length,
  };
}
