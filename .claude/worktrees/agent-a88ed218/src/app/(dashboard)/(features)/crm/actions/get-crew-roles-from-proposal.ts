'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

/**
 * Derives crew roles from a deal's latest proposal: for each proposal line item that
 * references a package with category "service", reads the package's staff_role
 * (definition.ingredient_meta.staff_role). When the line item is a bundle (category "package"),
 * also looks inside definition.blocks for line_item blocks and collects staff_role from those
 * ingredient packages (e.g. a "Wedding Package" that contains "DJ service" will yield DJ).
 */
export async function getCrewRolesFromProposalForDeal(dealId: string): Promise<string[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // Prefer the proposal the client signed (accepted), then sent/viewed, then latest
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

  const { data: items } = await supabase
    .from('proposal_items')
    .select('package_id, origin_package_id')
    .eq('proposal_id', pid);

  const packageIds = [...new Set((items ?? []).flatMap((i) => {
    const row = i as { package_id: string | null; origin_package_id: string | null };
    return [row.package_id, row.origin_package_id].filter((id): id is string => typeof id === 'string' && id.trim() !== '');
  }))];
  if (packageIds.length === 0) return [];

  const { data: packages } = await supabase
    .from('packages')
    .select('id, category, definition')
    .in('id', packageIds)
    .eq('workspace_id', workspaceId);

  const roles: string[] = [];
  const ingredientIds = new Set<string>();

  for (const p of packages ?? []) {
    const row = p as { id: string; category?: string; definition?: unknown };
    const def = typeof row.definition === 'string' ? (JSON.parse(row.definition) as Record<string, unknown>) : row.definition;

    if (row.category === 'service') {
      const staffRole = (def as { ingredient_meta?: { staff_role?: string | null } } | null)?.ingredient_meta?.staff_role;
      if (typeof staffRole === 'string' && staffRole.trim()) roles.push(staffRole.trim());
      continue;
    }

    if (row.category === 'package' && def && Array.isArray((def as { blocks?: unknown }).blocks)) {
      const blocks = (def as { blocks: { type?: string; catalogId?: string }[] }).blocks;
      for (const b of blocks) {
        if (b?.type === 'line_item' && typeof b.catalogId === 'string' && b.catalogId.trim()) {
          ingredientIds.add(b.catalogId.trim());
        }
      }
    }
  }

  if (ingredientIds.size > 0) {
    const { data: ingredientPackages } = await supabase
      .from('packages')
      .select('id, category, definition')
      .in('id', [...ingredientIds])
      .eq('workspace_id', workspaceId);

    for (const p of ingredientPackages ?? []) {
      const row = p as { category?: string; definition?: unknown };
      if (row.category !== 'service') continue;
      const def = typeof row.definition === 'string' ? (JSON.parse(row.definition) as Record<string, unknown>) : row.definition;
      const staffRole = (def as { ingredient_meta?: { staff_role?: string | null } } | null)?.ingredient_meta?.staff_role;
      if (typeof staffRole === 'string' && staffRole.trim()) roles.push(staffRole.trim());
    }
  }

  return [...new Set(roles)];
}

export type CrewRolesDiagnostic = {
  step: 'no_proposal' | 'no_items' | 'no_package_ids' | 'no_packages_found' | 'no_roles' | 'ok';
  proposalId?: string;
  proposalStatus?: string;
  itemCount?: number;
  packageIdCount?: number;
  /** Top-level packages on the proposal (name, category, staffRole if service). */
  packages?: { name: string; category: string; staffRole?: string | null }[];
  /** Ingredients we looked up from bundles (name, category, staffRole if service). */
  ingredients?: { name: string; category: string; staffRole?: string | null }[];
  rolesFound?: string[];
};

/**
 * Returns why crew roles were or weren't found for a deal's proposal. Use when sync finds 0 roles
 * so the user can see what we looked at (e.g. "Proposal has a bundle; its ingredients have no staff role").
 */
export async function getCrewRolesFromProposalDiagnostic(dealId: string): Promise<CrewRolesDiagnostic> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { step: 'no_proposal' };
  }

  const supabase = await createClient();

  const { data: acceptedOrSent } = await supabase
    .from('proposals')
    .select('id, status')
    .eq('deal_id', dealId)
    .in('status', ['accepted', 'sent', 'viewed'])
    .order('created_at', { ascending: false })
    .limit(1);

  const { data: anyProposal } = await supabase
    .from('proposals')
    .select('id, status')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1);

  const proposal = (acceptedOrSent?.[0] ?? anyProposal?.[0]) as { id: string; status: string } | undefined;
  if (!proposal?.id) {
    return { step: 'no_proposal' };
  }

  const { data: allItems } = await supabase
    .from('proposal_items')
    .select('id, package_id, origin_package_id')
    .eq('proposal_id', proposal.id);

  const itemCount = (allItems ?? []).length;
  const packageIds = [...new Set((allItems ?? []).flatMap((i) => {
    const row = i as { package_id: string | null; origin_package_id: string | null };
    return [row.package_id, row.origin_package_id].filter((id): id is string => typeof id === 'string' && id.trim() !== '');
  }))];

  if (packageIds.length === 0) {
    return {
      step: itemCount === 0 ? 'no_items' : 'no_package_ids',
      proposalId: proposal.id,
      proposalStatus: proposal.status,
      itemCount,
    };
  }

  const { data: packages } = await supabase
    .from('packages')
    .select('id, name, category, definition')
    .in('id', packageIds)
    .eq('workspace_id', workspaceId);

  if (!packages?.length) {
    return {
      step: 'no_packages_found',
      proposalId: proposal.id,
      proposalStatus: proposal.status,
      itemCount,
      packageIdCount: packageIds.length,
    };
  }

  const packageSummary: { name: string; category: string; staffRole?: string | null }[] = [];
  const ingredientIds = new Set<string>();

  for (const p of packages ?? []) {
    const row = p as { id: string; name?: string; category?: string; definition?: unknown };
    const def = typeof row.definition === 'string' ? (JSON.parse(row.definition) as Record<string, unknown>) : row.definition;
    const name = (row.name ?? 'Untitled') as string;
    const category = (row.category ?? '') as string;

    if (row.category === 'service') {
      const staffRole = (def as { ingredient_meta?: { staff_role?: string | null } } | null)?.ingredient_meta?.staff_role;
      packageSummary.push({ name, category, staffRole: staffRole ?? null });
      if (typeof staffRole === 'string' && staffRole.trim()) continue;
    }

    if (row.category === 'package' && def && Array.isArray((def as { blocks?: unknown }).blocks)) {
      packageSummary.push({ name, category });
      const blocks = (def as { blocks: { type?: string; catalogId?: string }[] }).blocks;
      for (const b of blocks) {
        if (b?.type === 'line_item' && typeof b.catalogId === 'string' && b.catalogId.trim()) {
          ingredientIds.add(b.catalogId.trim());
        }
      }
    }
  }

  let ingredientSummary: { name: string; category: string; staffRole?: string | null }[] = [];
  if (ingredientIds.size > 0) {
    const { data: ingredientPackages } = await supabase
      .from('packages')
      .select('id, name, category, definition')
      .in('id', [...ingredientIds])
      .eq('workspace_id', workspaceId);

    for (const p of ingredientPackages ?? []) {
      const row = p as { name?: string; category?: string; definition?: unknown };
      const def = typeof row.definition === 'string' ? (JSON.parse(row.definition) as Record<string, unknown>) : row.definition;
      const staffRole = (def as { ingredient_meta?: { staff_role?: string | null } } | null)?.ingredient_meta?.staff_role;
      ingredientSummary.push({
        name: (row.name ?? 'Untitled') as string,
        category: (row.category ?? '') as string,
        staffRole: staffRole ?? null,
      });
    }
  }

  const rolesFound: string[] = [];
  for (const p of packageSummary) {
    if (typeof p.staffRole === 'string' && p.staffRole.trim()) rolesFound.push(p.staffRole.trim());
  }
  for (const p of ingredientSummary) {
    if (typeof p.staffRole === 'string' && p.staffRole.trim()) rolesFound.push(p.staffRole.trim());
  }
  const roles = [...new Set(rolesFound)];

  if (roles.length > 0) {
    return {
      step: 'ok',
      proposalId: proposal.id,
      proposalStatus: proposal.status,
      itemCount,
      packageIdCount: packageIds.length,
      packages: packageSummary,
      ingredients: ingredientSummary.length ? ingredientSummary : undefined,
      rolesFound: roles,
    };
  }

  return {
    step: 'no_roles' as const,
    proposalId: proposal.id,
    proposalStatus: proposal.status,
    itemCount,
    packageIdCount: packageIds.length,
    packages: packageSummary,
    ingredients: ingredientSummary.length ? ingredientSummary : undefined,
  };
}
