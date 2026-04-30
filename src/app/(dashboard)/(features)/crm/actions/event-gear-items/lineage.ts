'use server';

/**
 * event-gear-items/lineage.ts — mutations on the proposal-gear lineage edge.
 *
 * Phase 2b of the proposal→gear lineage plan
 * (docs/audits/proposal-gear-lineage-plan-2026-04-29.md §5). Today exposes
 * `detachGearFromPackage` (Figma-style "detach instance" — the PM breaks the
 * link from a child gear row to its parent without deleting the row). Phase
 * 2b.5 will add `swapGearItem` once the catalog picker UI lands.
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

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
