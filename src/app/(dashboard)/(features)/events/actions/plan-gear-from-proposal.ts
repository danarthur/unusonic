'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type {
  ProposalGearBundle,
  ProposalGearChild,
  ProposalGearPlan,
  ProposalGearPlanItem,
  ProposalGearService,
  ProposalGearStandalone,
} from './plan-gear-from-proposal-types';

/**
 * Reads a deal's latest proposal and returns a structured plan describing the
 * gear that will land on the Plan tab. Phase 2 of the proposal→gear lineage
 * plan (docs/audits/proposal-gear-lineage-plan-2026-04-29.md §5).
 *
 * Public types live in `./plan-gear-from-proposal-types.ts` because Next.js
 * 'use server' modules must export only async functions — type exports here
 * would trigger a ReferenceError at request time.
 */

type ProposalItemRow = {
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
  decompose_on_gear_card: 'auto' | 'always' | 'never';
};

type InventoryMeta = { is_sub_rental: boolean; department: string | null };

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

function snapshotInventoryMeta(row: ProposalItemRow): InventoryMeta | null {
  const snap = row.definition_snapshot as { inventory_meta?: InventoryMeta } | null | undefined;
  if (!snap?.inventory_meta) return null;
  return {
    is_sub_rental: snap.inventory_meta.is_sub_rental ?? false,
    department: snap.inventory_meta.department ?? null,
  };
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

function resolveInventoryMeta(row: ProposalItemRow, pkg: CatalogRow | null): InventoryMeta {
  return snapshotInventoryMeta(row) ?? (pkg ? liveInventoryMeta(pkg) : { is_sub_rental: false, department: null });
}

/** Returns true iff this bundle should decompose into ingredient rows on the gear card. */
function shouldDecompose(pkg: CatalogRow, childCategories: string[]): boolean {
  if (pkg.decompose_on_gear_card === 'always') return true;
  if (pkg.decompose_on_gear_card === 'never') return false;
  return childCategories.some((c) => c === 'rental');
}

function freezePackageSnapshot(pkg: CatalogRow, decomposed: boolean): Record<string, unknown> {
  const def = typeof pkg.definition === 'string'
    ? (JSON.parse(pkg.definition) as Record<string, unknown>)
    : (pkg.definition as Record<string, unknown> | null);
  return {
    v: 1,
    name: pkg.name,
    category: pkg.category,
    decomposed,
    blocks: def?.blocks ?? null,
    decompose_on_gear_card: pkg.decompose_on_gear_card,
  };
}

function catalogIdFor(row: ProposalItemRow): string | null {
  return row.origin_package_id ?? row.package_id;
}

async function loadCatalogIndex(
  supabase: SupabaseServerClient,
  workspaceId: string,
  catalogIds: string[],
): Promise<Map<string, CatalogRow>> {
  if (catalogIds.length === 0) return new Map();
  const { data } = await supabase
    .from('packages')
    .select('id, name, category, is_sub_rental, definition, decompose_on_gear_card')
    .in('id', catalogIds)
    .eq('workspace_id', workspaceId);
  const index = new Map<string, CatalogRow>();
  for (const row of (data ?? []) as CatalogRow[]) {
    index.set(row.id, row);
  }
  return index;
}

type Bucket = { header: ProposalItemRow | null; members: ProposalItemRow[] };

function bucketByInstance(items: ProposalItemRow[]): { instances: Map<string, Bucket>; loose: ProposalItemRow[] } {
  const instances = new Map<string, Bucket>();
  const loose: ProposalItemRow[] = [];
  for (const row of items) {
    if (row.package_instance_id) {
      const bucket = instances.get(row.package_instance_id) ?? { header: null, members: [] };
      if (row.is_package_header) bucket.header = row;
      else bucket.members.push(row);
      instances.set(row.package_instance_id, bucket);
    } else {
      loose.push(row);
    }
  }
  return { instances, loose };
}

function walkBundleChildren(
  members: ProposalItemRow[],
  catalog: Map<string, CatalogRow>,
): { children: ProposalGearChild[]; categories: string[] } {
  const children: ProposalGearChild[] = [];
  const categories: string[] = [];
  for (const member of members) {
    const memberCatalogId = catalogIdFor(member);
    if (!memberCatalogId) continue;
    const memberCatalog = catalog.get(memberCatalogId) ?? null;
    const category = memberCatalog?.category ?? null;
    if (category) categories.push(category);
    if (category !== 'rental') continue;
    const inv = resolveInventoryMeta(member, memberCatalog);
    children.push({
      proposalItemId: member.id,
      catalogPackageId: memberCatalogId,
      name: member.name,
      quantity: member.quantity ?? 1,
      isSubRental: inv.is_sub_rental,
      department: inv.department,
    });
  }
  return { children, categories };
}

function buildBundleItem(
  bucket: Bucket,
  catalog: Map<string, CatalogRow>,
  instanceId: string,
): ProposalGearBundle | null {
  const header = bucket.header;
  if (!header) return null;
  const headerCatalogId = catalogIdFor(header);
  if (!headerCatalogId) return null;
  const headerCatalog = catalog.get(headerCatalogId) ?? null;
  if (!headerCatalog) return null;

  const { children, categories } = walkBundleChildren(bucket.members, catalog);
  const decomposed = shouldDecompose(headerCatalog, categories);
  const wholeMeta = resolveInventoryMeta(header, headerCatalog);

  return {
    kind: 'bundle',
    headerProposalItemId: header.id,
    packageInstanceId: instanceId,
    catalogPackageId: headerCatalogId,
    packageName: headerCatalog.name,
    packageSnapshot: freezePackageSnapshot(headerCatalog, decomposed),
    decomposed,
    headerQuantity: header.quantity ?? 1,
    wholeRowMeta: { isSubRental: wholeMeta.is_sub_rental, department: wholeMeta.department },
    children,
  };
}

function buildStandaloneItem(
  row: ProposalItemRow,
  catalog: Map<string, CatalogRow>,
): ProposalGearStandalone | null {
  const catalogId = catalogIdFor(row);
  if (!catalogId) return null;
  const pkg = catalog.get(catalogId);
  if (!pkg || pkg.category !== 'rental') return null;
  const inv = resolveInventoryMeta(row, pkg);
  return {
    kind: 'standalone',
    proposalItemId: row.id,
    catalogPackageId: catalogId,
    name: row.name,
    quantity: row.quantity ?? 1,
    isSubRental: inv.is_sub_rental,
    department: inv.department,
  };
}

function buildServiceItem(
  row: ProposalItemRow,
  catalog: Map<string, CatalogRow>,
): ProposalGearService | null {
  const catalogId = catalogIdFor(row);
  if (!catalogId) return null;
  const pkg = catalog.get(catalogId);
  if (!pkg || pkg.category !== 'service') return null;
  return {
    kind: 'service',
    proposalItemId: row.id,
    catalogPackageId: catalogId,
    serviceName: row.name,
    packageSnapshot: freezePackageSnapshot(pkg, true),
    quantity: row.quantity ?? 1,
    packageInstanceId: row.package_instance_id,
  };
}

function collectCatalogIds(items: ProposalItemRow[]): string[] {
  const ids = new Set<string>();
  for (const row of items) {
    const id = catalogIdFor(row);
    if (id) ids.add(id);
  }
  return [...ids];
}

function assembleInstanceItems(
  instances: Map<string, Bucket>,
  catalog: Map<string, CatalogRow>,
): ProposalGearPlanItem[] {
  const out: ProposalGearPlanItem[] = [];
  for (const [instanceId, bucket] of instances) {
    const bundle = buildBundleItem(bucket, catalog, instanceId);
    if (bundle) {
      out.push(bundle);
      // Service children of the bundle are surfaced as top-level service
      // parents (Phase 2e). Bundle.children stays restricted to rentals so
      // the bundle's collapsed-state count stays meaningful.
      for (const member of bucket.members) {
        const service = buildServiceItem(member, catalog);
        if (service) out.push(service);
      }
      continue;
    }
    // Orphan children (no header in their group) — treat each independently.
    for (const member of bucket.members) {
      const item = buildStandaloneItem(member, catalog) ?? buildServiceItem(member, catalog);
      if (item) out.push(item);
    }
  }
  return out;
}

function assembleLooseItems(
  loose: ProposalItemRow[],
  catalog: Map<string, CatalogRow>,
): ProposalGearPlanItem[] {
  const out: ProposalGearPlanItem[] = [];
  for (const row of loose) {
    if (row.is_package_header) continue;
    const item = buildStandaloneItem(row, catalog) ?? buildServiceItem(row, catalog);
    if (item) out.push(item);
  }
  return out;
}

export async function planGearFromProposal(dealId: string): Promise<ProposalGearPlan | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const proposalId = await findRelevantProposalId(supabase, dealId);
  if (!proposalId) return null;

  const { data: rawItems } = await supabase
    .from('proposal_items')
    .select('id, package_id, origin_package_id, name, quantity, definition_snapshot, is_package_header, package_instance_id')
    .eq('proposal_id', proposalId);

  if (!rawItems?.length) return { proposalId, items: [] };

  const items = rawItems as ProposalItemRow[];
  const catalog = await loadCatalogIndex(supabase, workspaceId, collectCatalogIds(items));
  const { instances, loose } = bucketByInstance(items);

  return {
    proposalId,
    items: [...assembleInstanceItems(instances, catalog), ...assembleLooseItems(loose, catalog)],
  };
}
