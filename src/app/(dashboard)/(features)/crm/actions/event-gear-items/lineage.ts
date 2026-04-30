'use server';

/**
 * event-gear-items/lineage.ts — mutations on the proposal-gear lineage edge.
 *
 * Phase 2b/5b of the proposal→gear lineage plan
 * (docs/audits/proposal-gear-lineage-plan-2026-04-29.md §5). Today exposes:
 *   - detachGearFromPackage (Figma-style "detach instance")
 *   - materializeKitFromCrew (Phase 5b — pull a person's verified kit under
 *     a service parent)
 * Phase 2b.5 will add `swapGearItem` once the catalog picker UI lands.
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { MaterializeKitResult } from './types';

const UuidSchema = z.string().uuid();

/**
 * Detaches a child gear row from its package parent. Sets
 * `parent_gear_item_id = NULL` and `lineage_source = 'pm_detached'`.
 * `proposal_item_id` is preserved so the row still appears in drift checks
 * (Phase 3) — detachment is about hierarchy, not lineage.
 *
 * Idempotent: detaching an already-detached row is a no-op (still returns
 * success, since the resulting state is what the caller asked for).
 *
 * Refuses to detach package parents — those are conceptual headers, not
 * children. Detaching a parent would orphan all its children's
 * parent_gear_item_id FK (CASCADE would delete them on a parent delete; on
 * a parent detach we'd leave them dangling). UI should hide this action
 * from parent rows.
 */
export async function detachGearFromPackage(
  gearItemId: string,
): Promise<{ success: boolean; error?: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const idParsed = UuidSchema.safeParse(gearItemId);
  if (!idParsed.success) return { success: false, error: 'Invalid gear item id.' };

  const supabase = await createClient();

  const { data: current, error: readErr } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('is_package_parent, parent_gear_item_id, lineage_source')
    .eq('id', idParsed.data)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (readErr || !current) {
    return { success: false, error: readErr?.message ?? 'Gear item not found.' };
  }
  if (current.is_package_parent) {
    return { success: false, error: 'Cannot detach a package parent row.' };
  }
  if (current.parent_gear_item_id === null && current.lineage_source === 'pm_detached') {
    return { success: true };
  }

  const { error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .update({ parent_gear_item_id: null, lineage_source: 'pm_detached' })
    .eq('id', idParsed.data)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] detachGearFromPackage:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

const MaterializeKitSchema = z.object({
  serviceGearItemId: UuidSchema,
  entityId: UuidSchema,
});

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type ServiceParentRow = {
  id: string;
  event_id: string;
  is_package_parent: boolean;
  package_snapshot: Record<string, unknown> | null;
  sort_order: number;
};

async function loadServiceParent(
  supabase: SupabaseServerClient,
  serviceGearItemId: string,
  workspaceId: string,
): Promise<{ ok: true; parent: ServiceParentRow } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('id, event_id, is_package_parent, package_snapshot, sort_order')
    .eq('id', serviceGearItemId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (error || !data) return { ok: false, error: error?.message ?? 'Service row not found.' };
  if (!data.is_package_parent) return { ok: false, error: 'Target row is not a parent.' };
  const category = (data.package_snapshot as { category?: string } | null)?.category;
  if (category !== 'service') return { ok: false, error: 'Materialize only applies to service parents.' };
  return { ok: true, parent: data as ServiceParentRow };
}

async function clearMaterializedChildren(
  supabase: SupabaseServerClient,
  parentId: string,
  workspaceId: string,
): Promise<{ ok: true; cleared: number } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .delete()
    .eq('parent_gear_item_id', parentId)
    .eq('workspace_id', workspaceId)
    .eq('lineage_source', 'kit_materialized')
    .select('id');
  if (error) {
    console.error('[CRM] materializeKitFromCrew (clear):', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, cleared: data?.length ?? 0 };
}

type ApprovedKitItem = { id: string; name: string; quantity: number | null; catalog_item_id: string | null };

async function loadApprovedKit(
  supabase: SupabaseServerClient,
  entityId: string,
  workspaceId: string,
): Promise<{ ok: true; items: ApprovedKitItem[] } | { ok: false; error: string }> {
  const { data, error } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .select('id, name, quantity, catalog_item_id')
    .eq('entity_id', entityId)
    .eq('workspace_id', workspaceId)
    .eq('verification_status', 'approved');
  if (error) {
    console.error('[CRM] materializeKitFromCrew (kit read):', error.message);
    return { ok: false, error: error.message };
  }
  return { ok: true, items: (data ?? []) as ApprovedKitItem[] };
}

async function resolveSupplierName(
  supabase: SupabaseServerClient,
  entityId: string,
): Promise<string | null> {
  const { data } = await supabase
    .schema('directory')
    .from('entities')
    .select('display_name')
    .eq('id', entityId)
    .maybeSingle();
  return data?.display_name ?? null;
}

function buildKitInserts(
  parent: ServiceParentRow,
  kit: ApprovedKitItem[],
  entityId: string,
  workspaceId: string,
) {
  const baseSort = (parent.sort_order ?? 0) + 1;
  return kit.map((item, idx) => ({
    event_id: parent.event_id,
    workspace_id: workspaceId,
    name: item.name,
    quantity: item.quantity ?? 1,
    status: 'allocated' as const,
    catalog_package_id: item.catalog_item_id,
    is_sub_rental: false,
    department: null,
    sort_order: baseSort + idx,
    lineage_source: 'kit_materialized',
    parent_gear_item_id: parent.id,
    source: 'crew' as const,
    supplied_by_entity_id: entityId,
    is_package_parent: false,
  }));
}

/**
 * Materializes a crew member's approved verified kit (`ops.crew_equipment`
 * with verification_status='approved') as children of a service parent gear
 * row. Phase 5b of the proposal→gear lineage plan.
 *
 * Re-running with a different entityId replaces the prior kit children
 * cleanly: rows with `lineage_source='kit_materialized'` get deleted before
 * the new ones land. PM-added or proposal-anchored siblings under the
 * service stay untouched.
 *
 * Refuses to materialize on package parents (different decomposition path)
 * or on rows that aren't parents at all.
 */
export async function materializeKitFromCrew(
  input: { serviceGearItemId: string; entityId: string },
): Promise<MaterializeKitResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const parsed = MaterializeKitSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const supabase = await createClient();

  const parentResult = await loadServiceParent(supabase, parsed.data.serviceGearItemId, workspaceId);
  if (!parentResult.ok) return { success: false, error: parentResult.error };
  const { parent } = parentResult;

  const cleared = await clearMaterializedChildren(supabase, parent.id, workspaceId);
  if (!cleared.ok) return { success: false, error: cleared.error };

  const kitResult = await loadApprovedKit(supabase, parsed.data.entityId, workspaceId);
  if (!kitResult.ok) return { success: false, error: kitResult.error };

  if (kitResult.items.length === 0) {
    return { success: true, added: 0, replaced: cleared.cleared, supplierName: null };
  }

  const supplierName = await resolveSupplierName(supabase, parsed.data.entityId);
  const inserts = buildKitInserts(parent, kitResult.items, parsed.data.entityId, workspaceId);

  const { error: insertErr } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .insert(inserts);
  if (insertErr) {
    console.error('[CRM] materializeKitFromCrew (insert):', insertErr.message);
    return { success: false, error: insertErr.message };
  }

  return {
    success: true,
    added: inserts.length,
    replaced: cleared.cleared,
    supplierName,
  };
}
