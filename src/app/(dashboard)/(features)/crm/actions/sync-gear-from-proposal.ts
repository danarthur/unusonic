'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getGearItemsFromProposalForDeal } from './get-gear-from-proposal';

export type SyncGearFromProposalResult =
  | { success: true; added: number }
  | { success: false; error: string };

/**
 * On-demand sync: finds the deal linked to this event, extracts rental packages
 * from that deal's proposal, and inserts them as ops.event_gear_items.
 * Deduplicates by catalog_package_id so re-syncing is safe.
 */
export async function syncGearFromProposalToEvent(eventId: string): Promise<SyncGearFromProposalResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { data: event, error: eventErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, project:projects!inner(workspace_id)')
    .eq('id', eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();

  if (eventErr || !event) return { success: false, error: 'Event not found.' };

  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!deal?.id) return { success: false, error: 'No deal linked to this event.' };

  const proposalGear = await getGearItemsFromProposalForDeal(deal.id);
  if (proposalGear.length === 0) return { success: true, added: 0 };

  // Get existing gear to deduplicate by catalog_package_id
  const { data: existing } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('catalog_package_id, sort_order')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId);

  const existingPkgIds = new Set(
    (existing ?? [])
      .map((g: { catalog_package_id: string | null }) => g.catalog_package_id)
      .filter(Boolean)
  );
  const maxSort = (existing ?? []).reduce((m: number, g: { sort_order: number }) => Math.max(m, g.sort_order), -1);

  const newGear = proposalGear.filter((g) => {
    const pkgId = g.catalog_package_id ?? g.id;
    return pkgId && !existingPkgIds.has(pkgId);
  });

  if (newGear.length === 0) return { success: true, added: 0 };

  const inserts = newGear.map((g, i) => ({
    event_id: eventId,
    workspace_id: workspaceId,
    name: g.name,
    quantity: (g as unknown as { quantity?: number }).quantity ?? 1,
    status: 'pending' as const,
    catalog_package_id: (g.catalog_package_id ?? g.id) || null,
    is_sub_rental: (g as unknown as { is_sub_rental?: boolean }).is_sub_rental ?? false,
    department: (g as unknown as { department?: string | null }).department ?? null,
    sort_order: maxSort + 1 + i,
  }));

  const { error: insertErr } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .insert(inserts);

  if (insertErr) {
    console.error('[CRM] syncGearFromProposalToEvent:', insertErr.message);
    return { success: false, error: insertErr.message };
  }

  return { success: true, added: newGear.length };
}
