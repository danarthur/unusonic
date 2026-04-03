'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { GearItem } from '../components/flight-checks/types';

/**
 * Extracts gear items from a deal's latest proposal.
 * Looks for rental packages (category = 'rental') in proposal line items.
 * Also resolves rental ingredients inside bundles (category = 'package').
 * Returns GearItem[] with catalog provenance, quantity from the proposal, and sub-rental flag.
 */
export async function getGearItemsFromProposalForDeal(dealId: string): Promise<GearItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // Prefer accepted/sent proposal, fall back to most recent
  const { data: acceptedOrSent } = await supabase
    .from('proposals')
    .select('id')
    .eq('deal_id', dealId)
    .in('status', ['accepted', 'sent', 'viewed'])
    .order('created_at', { ascending: false })
    .limit(1);

  const { data: anyProposal } = await supabase
    .from('proposals')
    .select('id')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1);

  const proposalId = (acceptedOrSent?.[0] ?? anyProposal?.[0]) as { id: string } | undefined;
  if (!proposalId?.id) return [];
  const pid = proposalId.id;

  // Fetch all line items with their catalog package reference and quantity
  // definition_snapshot.inventory_meta carries snapshotted is_sub_rental + department (rows post Task 4.5)
  const { data: items } = await supabase
    .from('proposal_items')
    .select('package_id, origin_package_id, name, quantity, definition_snapshot')
    .eq('proposal_id', pid);

  if (!items?.length) return [];

  // Build snapshot inventory map: packageId → { is_sub_rental, department }
  // Prefers snapshotted values (written at proposal creation, Task 4.5) over live catalog reads.
  type InventoryMeta = { is_sub_rental: boolean; department: string | null };
  const snapshotInventory = new Map<string, InventoryMeta>();
  for (const item of items) {
    const row = item as { package_id: string | null; origin_package_id: string | null; definition_snapshot?: Record<string, unknown> | null };
    const pkgId = row.origin_package_id ?? row.package_id;
    if (!pkgId) continue;
    const snap = row.definition_snapshot as { inventory_meta?: InventoryMeta } | null | undefined;
    if (snap?.inventory_meta && !snapshotInventory.has(pkgId)) {
      snapshotInventory.set(pkgId, {
        is_sub_rental: snap.inventory_meta.is_sub_rental ?? false,
        department: snap.inventory_meta.department ?? null,
      });
    }
  }

  // Collect all referenced package IDs (direct and origin)
  const packageIds = [...new Set((items).flatMap((i) => {
    const row = i as { package_id: string | null; origin_package_id: string | null; name: string; quantity: number };
    return [row.package_id, row.origin_package_id].filter((id): id is string => typeof id === 'string' && id.trim() !== '');
  }))];
  if (packageIds.length === 0) return [];

  const { data: packages } = await supabase
    .from('packages')
    .select('id, name, category, is_sub_rental, definition')
    .in('id', packageIds)
    .eq('workspace_id', workspaceId);

  const packageMap = new Map(
    (packages ?? []).map((p) => [p.id, p as {
      id: string;
      name: string;
      category: string;
      is_sub_rental: boolean;
      definition: unknown;
    }])
  );

  // Map proposal item → quantity
  const quantityMap = new Map<string, number>();
  for (const item of items) {
    const row = item as { package_id: string | null; origin_package_id: string | null; quantity: number };
    const id = row.package_id ?? row.origin_package_id;
    if (id) quantityMap.set(id, (quantityMap.get(id) ?? 0) + (row.quantity ?? 1));
  }

  const gearItems: GearItem[] = [];
  const bundleIngredientIds = new Set<string>();

  // Helper: resolve inventory meta — prefers snapshot, falls back to live catalog
  function resolveInventory(pkgId: string, livePkg: { is_sub_rental: boolean; definition: unknown }): InventoryMeta {
    const snap = snapshotInventory.get(pkgId);
    if (snap) return snap;
    const def = typeof livePkg.definition === 'string'
      ? (JSON.parse(livePkg.definition) as Record<string, unknown>)
      : (livePkg.definition as Record<string, unknown> | null);
    return {
      is_sub_rental: livePkg.is_sub_rental ?? false,
      department: (def?.ingredient_meta as { department?: string | null } | null | undefined)?.department ?? null,
    };
  }

  // Direct rental packages on the proposal
  for (const [pkgId, pkg] of packageMap) {
    if (pkg.category === 'rental') {
      const qty = quantityMap.get(pkgId) ?? 1;
      const inv = resolveInventory(pkgId, pkg);
      gearItems.push({
        id: pkgId,
        catalog_package_id: pkgId,
        name: pkg.name,
        quantity: qty,
        status: 'allocated',
        is_sub_rental: inv.is_sub_rental,
        department: inv.department,
      } as GearItem & { department: string | null });
      continue;
    }

    // Bundles (category = 'package'): look for rental ingredients inside blocks
    if (pkg.category === 'package') {
      const def = typeof pkg.definition === 'string'
        ? (JSON.parse(pkg.definition) as Record<string, unknown>)
        : (pkg.definition as Record<string, unknown> | null);
      if (def && Array.isArray(def.blocks)) {
        for (const block of def.blocks as { type?: string; catalogId?: string; quantity?: number }[]) {
          if (block?.type === 'line_item' && typeof block.catalogId === 'string' && block.catalogId.trim()) {
            bundleIngredientIds.add(block.catalogId.trim());
          }
        }
      }
    }
  }

  // Resolve rental ingredients from inside bundles
  if (bundleIngredientIds.size > 0) {
    const { data: ingredientPackages } = await supabase
      .from('packages')
      .select('id, name, category, is_sub_rental, definition')
      .in('id', [...bundleIngredientIds])
      .eq('workspace_id', workspaceId);

    for (const pkg of ingredientPackages ?? []) {
      const row = pkg as { id: string; name: string; category: string; is_sub_rental: boolean; definition: unknown };
      if (row.category !== 'rental') continue;
      const qty = quantityMap.get(row.id) ?? 1;
      const inv = resolveInventory(row.id, row);
      gearItems.push({
        id: row.id,
        catalog_package_id: row.id,
        name: row.name,
        quantity: qty,
        status: 'allocated',
        is_sub_rental: inv.is_sub_rental,
        department: inv.department,
      } as GearItem & { department: string | null });
    }
  }

  // Deduplicate by catalog_package_id (in case same item appears in multiple bundles)
  const seen = new Set<string>();
  return gearItems.filter((item) => {
    const key = item.catalog_package_id ?? item.id;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}
