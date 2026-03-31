'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// ── Types ──────────────────────────────────────────────────────────────────

export type ClientConcentrationEntry = {
  name: string;
  revenue: number; // cents
  percentage: number; // 0–100
};

export type ClientConcentrationData = {
  clients: ClientConcentrationEntry[];
};

const EMPTY: ClientConcentrationData = { clients: [] };

// ── Action ─────────────────────────────────────────────────────────────────

/**
 * Top 5 clients by revenue with concentration percentages.
 * Client = the bill-to entity on a deal (deals.organization_id).
 * Revenue = non-optional proposal item totals for signed/accepted proposals.
 */
export async function getClientConcentration(): Promise<ClientConcentrationData> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();

  // Fetch deals with a client org linked (organization_id = bill-to entity)
  const { data: deals, error: dealsError } = await supabase
    .from('deals')
    .select('id, organization_id')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .not('organization_id', 'is', null);

  if (dealsError || !deals?.length) return EMPTY;

  const dealIds = deals.map((d) => d.id);

  // Fetch signed/accepted proposals for these deals
  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, deal_id')
    .in('deal_id', dealIds)
    .in('status', ['accepted', 'signed']);

  if (!proposals?.length) return EMPTY;

  const proposalDealMap = new Map<string, string>();
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

  // Group revenue by client org
  const dealOrgMap = new Map<string, string>(); // deal_id → organization_id
  for (const deal of deals) {
    if (deal.organization_id) dealOrgMap.set(deal.id, deal.organization_id);
  }

  const orgRevenueMap = new Map<string, number>();
  let totalRevenue = 0;

  for (const [dealId, revenue] of dealValueMap) {
    const orgId = dealOrgMap.get(dealId);
    if (!orgId) continue;
    orgRevenueMap.set(orgId, (orgRevenueMap.get(orgId) ?? 0) + revenue);
    totalRevenue += revenue;
  }

  if (totalRevenue === 0) return EMPTY;

  // Sort by revenue and take top 5
  const topOrgIds = [...orgRevenueMap.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5);

  const orgIds = topOrgIds.map(([id]) => id);

  // Resolve names — try legacy_org_id first, then direct id
  const nameMap = new Map<string, string>();

  if (orgIds.length > 0) {
    const { data: byLegacy } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name, legacy_org_id')
      .in('legacy_org_id', orgIds);

    const foundLegacy = new Set<string>();
    for (const e of byLegacy ?? []) {
      if (e.legacy_org_id) {
        nameMap.set(e.legacy_org_id, e.display_name ?? 'Unknown');
        foundLegacy.add(e.legacy_org_id);
      }
    }

    // Fallback: direct entity id lookup for newer records
    const unfound = orgIds.filter((id) => !foundLegacy.has(id));
    if (unfound.length > 0) {
      const { data: byId } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name')
        .in('id', unfound);

      for (const e of byId ?? []) {
        nameMap.set(e.id, e.display_name ?? 'Unknown');
      }
    }
  }

  // Build result
  const clients: ClientConcentrationEntry[] = topOrgIds.map(([orgId, revenue]) => ({
    name: nameMap.get(orgId) ?? 'Unknown',
    revenue,
    percentage: Math.round((revenue / totalRevenue) * 100),
  }));

  return { clients };
}
