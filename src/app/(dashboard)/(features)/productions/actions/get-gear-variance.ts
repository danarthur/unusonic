'use server';

/**
 * getGearVariance(eventId) — Sold vs Planned vs Margin for the gear card.
 *
 * Phase 5c of the proposal→gear lineage plan
 * (docs/audits/proposal-gear-lineage-plan-2026-04-29.md §5 Phase 5c).
 *
 *   - Sold: revenue side. Sum of proposal_items.unit_price × quantity for
 *     rows whose linked catalog package is category='rental'. Snapshot at
 *     sale time, immune to subsequent catalog edits.
 *   - Planned: cost side. Sum of event_gear_items.quantity × catalog
 *     target_cost for rows that landed on the gear card. Uses today's
 *     catalog cost — drift from the snapshot when packages get re-priced.
 *   - Margin = Sold − Planned. Positive = the gear is on track to ship
 *     within the price the client paid; negative = we're over-spending.
 *
 * Read-only. RLS handles workspace isolation.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type GearVarianceResult = {
  hasData: boolean;
  sold: number;
  planned: number;
  margin: number;
};

const EMPTY: GearVarianceResult = { hasData: false, sold: 0, planned: 0, margin: 0 };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function resolveDealId(
  supabase: SupabaseServerClient,
  eventId: string,
  workspaceId: string,
): Promise<string | null> {
  const { data } = await supabase
    .from('deals')
    .select('id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return data?.id ?? null;
}

async function findRelevantProposalId(
  supabase: SupabaseServerClient,
  dealId: string,
): Promise<string | null> {
  const { data: live } = await supabase
    .from('proposals')
    .select('id')
    .eq('deal_id', dealId)
    .in('status', ['accepted', 'sent', 'viewed'])
    .order('created_at', { ascending: false })
    .limit(1);
  if (live?.[0]?.id) return live[0].id;

  const { data: any } = await supabase
    .from('proposals')
    .select('id')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1);
  return any?.[0]?.id ?? null;
}

type ProposalItemRow = {
  quantity: number;
  unit_price: number;
  package_id: string | null;
  origin_package_id: string | null;
};

function catalogIdForItem(row: { package_id: string | null; origin_package_id: string | null }): string | null {
  return row.origin_package_id ?? row.package_id;
}

async function loadRentalCatalogIds(
  supabase: SupabaseServerClient,
  workspaceId: string,
  catalogIds: string[],
): Promise<Set<string>> {
  if (catalogIds.length === 0) return new Set();
  const { data } = await supabase
    .from('packages')
    .select('id, category')
    .in('id', catalogIds)
    .eq('workspace_id', workspaceId);
  return new Set(
    ((data ?? []) as { id: string; category: string }[])
      .filter((p) => p.category === 'rental')
      .map((p) => p.id),
  );
}

async function computeSold(
  supabase: SupabaseServerClient,
  workspaceId: string,
  proposalId: string,
): Promise<number> {
  const { data: itemsRaw } = await supabase
    .from('proposal_items')
    .select('quantity, unit_price, package_id, origin_package_id')
    .eq('proposal_id', proposalId);
  const items = (itemsRaw ?? []) as ProposalItemRow[];
  if (items.length === 0) return 0;

  const catalogIds = new Set<string>();
  for (const i of items) {
    const id = catalogIdForItem(i);
    if (id) catalogIds.add(id);
  }
  const rentalIds = await loadRentalCatalogIds(supabase, workspaceId, [...catalogIds]);

  let total = 0;
  for (const item of items) {
    const id = catalogIdForItem(item);
    if (!id || !rentalIds.has(id)) continue;
    total += (item.unit_price ?? 0) * (item.quantity ?? 1);
  }
  return total;
}

type GearRow = { quantity: number; catalog_package_id: string | null };

async function loadCostByCatalogId(
  supabase: SupabaseServerClient,
  workspaceId: string,
  catalogIds: string[],
): Promise<Map<string, number>> {
  if (catalogIds.length === 0) return new Map();
  const { data } = await supabase
    .from('packages')
    .select('id, target_cost')
    .in('id', catalogIds)
    .eq('workspace_id', workspaceId);
  const out = new Map<string, number>();
  for (const p of (data ?? []) as { id: string; target_cost: number | null }[]) {
    out.set(p.id, p.target_cost ?? 0);
  }
  return out;
}

async function computePlanned(
  supabase: SupabaseServerClient,
  workspaceId: string,
  eventId: string,
): Promise<number> {
  const { data: rowsRaw } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('quantity, catalog_package_id, is_package_parent')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .eq('is_package_parent', false);
  const rows = (rowsRaw ?? []) as GearRow[];
  if (rows.length === 0) return 0;

  const catalogIds = new Set<string>();
  for (const r of rows) if (r.catalog_package_id) catalogIds.add(r.catalog_package_id);
  const costById = await loadCostByCatalogId(supabase, workspaceId, [...catalogIds]);

  let total = 0;
  for (const row of rows) {
    if (!row.catalog_package_id) continue;
    total += (costById.get(row.catalog_package_id) ?? 0) * (row.quantity ?? 1);
  }
  return total;
}

export async function getGearVariance(eventId: string): Promise<GearVarianceResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY;

  const supabase = await createClient();
  const dealId = await resolveDealId(supabase, eventId, workspaceId);
  if (!dealId) return EMPTY;

  const proposalId = await findRelevantProposalId(supabase, dealId);
  if (!proposalId) {
    // No proposal — Planned-only is meaningless without a Sold baseline.
    return EMPTY;
  }

  const [sold, planned] = await Promise.all([
    computeSold(supabase, workspaceId, proposalId),
    computePlanned(supabase, workspaceId, eventId),
  ]);

  if (sold === 0 && planned === 0) return EMPTY;

  return {
    hasData: true,
    sold,
    planned,
    margin: sold - planned,
  };
}
