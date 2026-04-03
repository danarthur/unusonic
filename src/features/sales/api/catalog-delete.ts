'use server';

import { createClient } from '@/shared/api/supabase/server';

export interface DeleteCheckResult {
  /** Always true — items can always be deleted. */
  canDelete: true;
  /** Number of proposal line items that reference this package (will be unlinked). */
  proposalCount: number;
  packageName: string;
}

/**
 * Check how many proposal references exist for each package.
 * All archived items CAN be deleted — proposals use snapshots and don't need the live catalog item.
 * References (origin_package_id, package_id) are NULLed out before deletion.
 */
export async function checkCanDeletePackages(
  packageIds: string[]
): Promise<Record<string, DeleteCheckResult>> {
  if (packageIds.length === 0) return {};
  const supabase = await createClient();
  const results: Record<string, DeleteCheckResult> = {};

  // Get package names
  const { data: pkgs } = await supabase
    .from('packages')
    .select('id, name')
    .in('id', packageIds);

  const nameMap = new Map((pkgs ?? []).map((p) => [p.id, p.name]));

  // Count proposal references for each package (for user information, not blocking)
  for (const id of packageIds) {
    const { count } = await supabase
      .from('proposal_items')
      .select('id', { count: 'exact', head: true })
      .or(`origin_package_id.eq.${id},package_id.eq.${id}`);

    results[id] = {
      canDelete: true,
      proposalCount: count ?? 0,
      packageName: nameMap.get(id) ?? 'Unknown',
    };
  }

  return results;
}

/**
 * Permanently delete archived packages.
 * Proposal line items that reference the deleted packages keep their snapshot data
 * but lose the catalog link (origin_package_id and package_id set to NULL).
 * Cleans up related data (embeddings, tags, assignees).
 */
export async function permanentlyDeletePackages(
  packageIds: string[]
): Promise<{ deleted: number; unlinkedProposalItems: number }> {
  if (packageIds.length === 0) return { deleted: 0, unlinkedProposalItems: 0 };
  const supabase = await createClient();

  let totalUnlinked = 0;

  for (const id of packageIds) {
    // Count references first (for reporting)
    const { count: refCount } = await supabase
      .from('proposal_items')
      .select('id', { count: 'exact', head: true })
      .or(`origin_package_id.eq.${id},package_id.eq.${id}`);
    totalUnlinked += refCount ?? 0;

    // 1. NULL out package_id FK on proposal_items (has FK constraint)
    await supabase
      .from('proposal_items')
      .update({ package_id: null })
      .eq('package_id', id);

    // 2. NULL out origin_package_id on proposal_items (soft reference)
    await supabase
      .from('proposal_items')
      .update({ origin_package_id: null })
      .eq('origin_package_id', id);
  }

  // 3. Clean up related data
  await supabase.from('package_tags').delete().in('package_id', packageIds);
  await supabase.from('catalog_embeddings').delete().in('package_id', packageIds);

  // 4. Clean up assignees via RPC (catalog schema not PostgREST-exposed)
  for (const id of packageIds) {
    const { data: assignees } = await supabase.rpc('get_catalog_item_assignees', {
      p_package_id: id,
    });
    for (const a of (assignees ?? []) as { id: string }[]) {
      await supabase.rpc('remove_catalog_item_assignee', { p_assignee_id: a.id });
    }
  }

  // 5. Delete the packages
  const { error } = await supabase.from('packages').delete().in('id', packageIds);
  if (error) {
    console.error('[catalog-delete] Failed to delete packages:', error.message);
    return { deleted: 0, unlinkedProposalItems: totalUnlinked };
  }

  return { deleted: packageIds.length, unlinkedProposalItems: totalUnlinked };
}
