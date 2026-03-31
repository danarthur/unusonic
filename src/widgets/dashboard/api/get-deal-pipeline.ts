'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ── Types ──────────────────────────────────────────────────────────────────

export type PipelineStage = {
  status: string;
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

/** Pipeline ordering and weighting by deal status. */
const STAGE_CONFIG: Record<string, { label: string; weight: number; order: number }> = {
  inquiry: { label: 'Inquiry', weight: 0.1, order: 0 },
  proposal: { label: 'Proposal', weight: 0.25, order: 1 },
  contract_sent: { label: 'Contract sent', weight: 0.4, order: 2 },
  contract_signed: { label: 'Contract signed', weight: 0.6, order: 3 },
  deposit_received: { label: 'Deposit received', weight: 0.8, order: 4 },
  won: { label: 'Won', weight: 0.95, order: 5 },
};

const EMPTY: DealPipelineDTO = { stages: [], totalWeightedValue: 0, totalDeals: 0 };

// ── Action ─────────────────────────────────────────────────────────────────

export async function getDealPipeline(): Promise<DealPipelineDTO> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();

  // 1. Fetch all active (non-archived, non-lost) deals
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, status, budget_estimated')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null);

  if (dealsError || !deals?.length) return EMPTY;

  // Exclude lost deals from pipeline
  const pipelineDeals = deals.filter((d) => d.status !== 'lost');
  if (pipelineDeals.length === 0) return EMPTY;

  // 2. Fetch proposal item totals for deals that have proposals
  const dealIds = pipelineDeals.map((d) => d.id);

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id')
    .in('deal_id', dealIds)
    .neq('status', 'draft');

  const proposalDealMap = new Map<string, string>(); // proposal_id → deal_id
  for (const p of proposals ?? []) {
    // Keep first (most recent due to default ordering)
    if (!proposalDealMap.has(p.id)) proposalDealMap.set(p.id, p.deal_id);
  }

  const proposalIds = [...proposalDealMap.keys()];
  const dealValueMap = new Map<string, number>(); // deal_id → total cents

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

  // 3. Aggregate by status
  const statusBuckets = new Map<string, { count: number; totalValue: number }>();

  for (const deal of pipelineDeals) {
    const status = deal.status ?? 'inquiry';
    const bucket = statusBuckets.get(status) ?? { count: 0, totalValue: 0 };
    bucket.count += 1;
    // Prefer proposal-derived value, fall back to budget_estimated (stored in cents)
    const value = dealValueMap.get(deal.id) ?? deal.budget_estimated ?? 0;
    bucket.totalValue += value;
    statusBuckets.set(status, bucket);
  }

  // 4. Build ordered stages and compute weighted total
  let totalWeightedValue = 0;

  const stages: PipelineStage[] = [...statusBuckets.entries()]
    .map(([status, { count, totalValue }]) => {
      const config = STAGE_CONFIG[status] ?? { label: status, weight: 0.5, order: 99 };
      totalWeightedValue += Math.round(totalValue * config.weight);
      return { status, label: config.label, count, totalValue, _order: config.order };
    })
    .sort((a, b) => a._order - b._order)
    .map(({ _order, ...stage }) => stage);

  return {
    stages,
    totalWeightedValue,
    totalDeals: pipelineDeals.length,
  };
}
