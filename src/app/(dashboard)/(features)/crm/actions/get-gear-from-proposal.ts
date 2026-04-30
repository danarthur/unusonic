'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { GearItem } from '../components/flight-checks/types';

/**
 * Reads gear from a deal's latest proposal by consuming `proposal_items` directly.
 *
 * The proposal builder already decomposes bundles into header + child rows
 * (children carry `origin_package_id` pointing at the rental ingredient).
 * Phase 0 of the proposal→gear lineage plan
 * (docs/audits/proposal-gear-lineage-plan-2026-04-29.md) drops the
 * `definition.blocks[]` re-traversal — that work is already done in
 * proposal_items, and re-doing it threw away the line-level lineage.
 *
 * Rules:
 * - Skip rows where `is_package_header = true` (parent rows; Phase 2 will
 *   create gear-card parents from these).
 * - For non-header rows, resolve `origin_package_id ?? package_id` and emit a
 *   gear row only when that catalog row's `category = 'rental'`.
 * - Dedupe by catalog id, summing quantities — preserves the existing
 *   contract until Phase 2 introduces per-line lineage with `proposal_item_id`.
 */

type ProposalLineRow = {
  id: string;
  package_id: string | null;
  origin_package_id: string | null;
  name: string;
  quantity: number;
  definition_snapshot: Record<string, unknown> | null;
  is_package_header: boolean;
  package_instance_id: string | null;
};

type CatalogRow = {
  id: string;
  name: string;
  category: string;
  is_sub_rental: boolean;
  definition: unknown;
};

type InventoryMeta = { is_sub_rental: boolean; department: string | null };

type CatalogBucket = { qty: number; lines: ProposalLineRow[] };

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function findRelevantProposalId(
  supabase: SupabaseServerClient,
  dealId: string,
): Promise<string | null> {
  const { data: acceptedOrSent } = await supabase
    .from('proposals')
    .select('id')
    .eq('deal_id', dealId)
    .in('status', ['accepted', 'sent', 'viewed'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (acceptedOrSent?.[0]?.id) return acceptedOrSent[0].id;

  const { data: anyProposal } = await supabase
    .from('proposals')
    .select('id')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1);

  return anyProposal?.[0]?.id ?? null;
}

function bucketByCatalogId(rows: ProposalLineRow[]): Map<string, CatalogBucket> {
  const byCatalog = new Map<string, CatalogBucket>();
  for (const row of rows) {
    if (row.is_package_header) continue;
    const catalogId = row.origin_package_id ?? row.package_id;
    if (!catalogId) continue;
    const existing = byCatalog.get(catalogId);
    if (existing) {
      existing.qty += row.quantity ?? 1;
      existing.lines.push(row);
    } else {
      byCatalog.set(catalogId, { qty: row.quantity ?? 1, lines: [row] });
    }
  }
  return byCatalog;
}

function snapshotInventoryMeta(lines: ProposalLineRow[]): InventoryMeta | null {
  for (const line of lines) {
    const snap = line.definition_snapshot as { inventory_meta?: InventoryMeta } | null | undefined;
    if (snap?.inventory_meta) {
      return {
        is_sub_rental: snap.inventory_meta.is_sub_rental ?? false,
        department: snap.inventory_meta.department ?? null,
      };
    }
  }
  return null;
}

function liveInventoryMeta(pkg: CatalogRow): InventoryMeta {
  const def = typeof pkg.definition === 'string'
    ? (JSON.parse(pkg.definition) as Record<string, unknown>)
    : (pkg.definition as Record<string, unknown> | null);
  const ingredient = def?.ingredient_meta as { department?: string | null } | null | undefined;
  return {
    is_sub_rental: pkg.is_sub_rental ?? false,
    department: ingredient?.department ?? null,
  };
}

export async function getGearItemsFromProposalForDeal(dealId: string): Promise<GearItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  const proposalId = await findRelevantProposalId(supabase, dealId);
  if (!proposalId) return [];

  const { data: items } = await supabase
    .from('proposal_items')
    .select('id, package_id, origin_package_id, name, quantity, definition_snapshot, is_package_header, package_instance_id')
    .eq('proposal_id', proposalId);

  if (!items?.length) return [];

  const byCatalogId = bucketByCatalogId(items as ProposalLineRow[]);
  if (byCatalogId.size === 0) return [];

  const { data: packages } = await supabase
    .from('packages')
    .select('id, name, category, is_sub_rental, definition')
    .in('id', [...byCatalogId.keys()])
    .eq('workspace_id', workspaceId);

  const gearItems: (GearItem & { department: string | null })[] = [];
  for (const pkg of (packages ?? []) as CatalogRow[]) {
    if (pkg.category !== 'rental') continue;
    const bucket = byCatalogId.get(pkg.id);
    if (!bucket) continue;
    const inv = snapshotInventoryMeta(bucket.lines) ?? liveInventoryMeta(pkg);
    gearItems.push({
      id: pkg.id,
      catalog_package_id: pkg.id,
      name: pkg.name,
      quantity: bucket.qty,
      status: 'allocated',
      is_sub_rental: inv.is_sub_rental,
      department: inv.department,
    });
  }

  return gearItems;
}
