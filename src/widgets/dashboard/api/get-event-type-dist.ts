'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ── Types ──────────────────────────────────────────────────────────────────

export type EventTypeEntry = {
  label: string;
  revenue: number; // cents
  count: number;
};

export type EventTypeDistData = {
  types: EventTypeEntry[];
};

const EMPTY: EventTypeDistData = { types: [] };

// ── Action ─────────────────────────────────────────────────────────────────

/**
 * Revenue breakdown by event archetype.
 * Groups deals by their `event_archetype` field, computes revenue from
 * non-draft proposals, and returns top 5 types sorted by revenue descending.
 */
export async function getEventTypeDistribution(): Promise<EventTypeDistData> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();

  // Fetch all non-archived deals with their archetype
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, status, event_archetype')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null);

  if (dealsError || !deals?.length) return EMPTY;

  // Exclude lost deals (consistent with pipeline)
  const activeDeals = deals.filter((d) => d.status !== 'lost');
  if (activeDeals.length === 0) return EMPTY;
  const dealIds = activeDeals.map((d) => d.id);

  // Fetch non-draft proposals for these deals
  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id')
    .in('deal_id', dealIds)
    .neq('status', 'draft');

  if (!proposals?.length) return EMPTY;

  const proposalDealMap = new Map<string, string>(); // proposal_id → deal_id
  for (const p of proposals) {
    proposalDealMap.set(p.id, p.deal_id);
  }

  const proposalIds = [...proposalDealMap.keys()];

  // Fetch items
  const { data: items } = await supabase
    .from('proposal_items')
    .select('proposal_id, quantity, unit_price, override_price, is_optional, unit_multiplier')
    .in('proposal_id', proposalIds);

  // Build revenue per deal
  const dealValueMap = new Map<string, number>();
  for (const item of items ?? []) {
    if (item.is_optional) continue;
    const dealId = proposalDealMap.get(item.proposal_id);
    if (!dealId) continue;
    const price = item.override_price ?? item.unit_price ?? 0;
    const qty = item.quantity ?? 1;
    const multiplier = item.unit_multiplier ?? 1;
    dealValueMap.set(dealId, (dealValueMap.get(dealId) ?? 0) + price * qty * multiplier);
  }

  // Group by archetype
  const archetypeBuckets = new Map<string, { count: number; revenue: number }>();
  for (const deal of activeDeals) {
    const archetype = deal.event_archetype ?? 'other';
    const bucket = archetypeBuckets.get(archetype) ?? { count: 0, revenue: 0 };
    bucket.count += 1;
    bucket.revenue += dealValueMap.get(deal.id) ?? 0;
    archetypeBuckets.set(archetype, bucket);
  }

  // Sort by revenue descending, take top 5
  const types: EventTypeEntry[] = [...archetypeBuckets.entries()]
    .map(([archetype, { count, revenue }]) => ({
      label: archetype.charAt(0).toUpperCase() + archetype.slice(1),
      revenue,
      count,
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 5);

  return { types };
}
