'use server';

/**
 * event-gear-items/crew-source.ts — crew-as-gear-source flow (per-event).
 *
 * - getCrewEquipmentMatchesForEvent: cross-reference deal crew's approved
 *   equipment against an event's gear list (with double-booking guard).
 * - sourceGearFromCrew / unsourceGearFromCrew: flip an event gear item's
 *   `source` between 'company' and 'crew', updating the corresponding
 *   deal_crew row's `brings_own_gear`.
 *
 * The workspace-wide rollup lives in ./rollup.ts.
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import type { CrewGearMatch } from './types';

/**
 * Cross-references assigned crew equipment profiles against event gear items
 * via catalog_item_id / catalog_package_id. Returns a map keyed by event gear
 * item ID with an array of matching crew members who own that equipment.
 */
export async function getCrewEquipmentMatchesForEvent(
  eventId: string,
): Promise<Record<string, CrewGearMatch[]>> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return {};

  const supabase = await createClient();

  // 1. Resolve deal_id from the event
  const { data: evt } = await supabase
    .schema('ops')
    .from('events')
    .select('deal_id, starts_at, ends_at')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const dealId = (evt?.deal_id as string) ?? null;
  if (!dealId) return {};

  const eventStartsAt = (evt?.starts_at as string) ?? null;
  const eventEndsAt = (evt?.ends_at as string) ?? null;

  // 2. Get all assigned crew for this deal (entity_id IS NOT NULL)
  const { data: crewRows } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('entity_id')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .not('entity_id', 'is', null);

  const crewEntityIds: string[] = [
    ...new Set(
      ((crewRows ?? []) as { entity_id: string }[]).map((r) => r.entity_id),
    ),
  ];
  if (crewEntityIds.length === 0) return {};

  // 3. Get all APPROVED equipment for these crew members
  const { data: equipmentRows } = await supabase
    .schema('ops')
    .from('crew_equipment')
    .select('id, entity_id, name, catalog_item_id, verification_status')
    .in('entity_id', crewEntityIds)
    .eq('workspace_id', workspaceId)
    .eq('verification_status', 'approved');

  type EquipmentRow = {
    id: string;
    entity_id: string;
    name: string;
    catalog_item_id: string | null;
    verification_status: string;
  };
  const equipment: EquipmentRow[] = (equipmentRows ?? []) as EquipmentRow[];
  if (equipment.length === 0) return {};

  // Build a map: catalog_item_id → equipment rows
  const equipByCatalogId = new Map<string, EquipmentRow[]>();
  for (const eq of equipment) {
    if (!eq.catalog_item_id) continue;
    const arr = equipByCatalogId.get(eq.catalog_item_id) ?? [];
    arr.push(eq);
    equipByCatalogId.set(eq.catalog_item_id, arr);
  }

  // 4. Get event gear items
  const { data: gearItems } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('id, catalog_package_id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId);

  type GearRow = { id: string; catalog_package_id: string | null };
  const gearRows: GearRow[] = (gearItems ?? []) as GearRow[];

  // 5. Check for double-booking: find other events overlapping this one
  //    that already have crew-sourced items from these crew members
  const doubleBookedEntityItems = new Set<string>(); // "entityId:catalogItemId"
  if (eventStartsAt && eventEndsAt) {
    // Get all crew-sourced items for overlapping events (not this event)
    const { data: overlappingGear } = await supabase
      .schema('ops')
      .from('event_gear_items')
      .select('supplied_by_entity_id, catalog_package_id, event:events!inner(starts_at, ends_at)')
      .eq('workspace_id', workspaceId)
      .eq('source', 'crew')
      .not('event_id', 'eq', eventId)
      .in('supplied_by_entity_id', crewEntityIds);

    const start = new Date(eventStartsAt);
    const end = new Date(eventEndsAt);

    // Supabase narrows `event:events!inner(...)` as an array shape (the
    // typegen can't prove 1:1 cardinality from FK metadata alone), so we
    // read the first element. `!inner` guarantees there's at least one.
    for (const row of overlappingGear ?? []) {
      const eventRow = Array.isArray(row.event) ? row.event[0] : row.event;
      if (!eventRow?.starts_at || !eventRow?.ends_at) continue;
      if (!row.catalog_package_id) continue;
      const oStart = new Date(eventRow.starts_at);
      const oEnd = new Date(eventRow.ends_at);
      if (oStart < end && oEnd > start) {
        doubleBookedEntityItems.add(`${row.supplied_by_entity_id}:${row.catalog_package_id}`);
      }
    }
  }

  // 6. Resolve entity names
  const { data: entities } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, attributes')
    .in('id', crewEntityIds);

  const nameMap = new Map<string, string>();
  for (const e of (entities ?? []) as { id: string; display_name: string | null; attributes: Record<string, unknown> | null }[]) {
    const attrs = readEntityAttrs(e.attributes, 'person');
    const fullName = [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim();
    nameMap.set(e.id, fullName || e.display_name || 'Unknown');
  }

  // 7. Build the result map
  const result: Record<string, CrewGearMatch[]> = {};

  for (const gear of gearRows) {
    if (!gear.catalog_package_id) continue;
    const matchingEquipment = equipByCatalogId.get(gear.catalog_package_id);
    if (!matchingEquipment) continue;

    const matches: CrewGearMatch[] = [];
    for (const eq of matchingEquipment) {
      // Skip if this crew member's equipment is already committed to an overlapping event
      if (doubleBookedEntityItems.has(`${eq.entity_id}:${gear.catalog_package_id}`)) continue;

      matches.push({
        entityId: eq.entity_id,
        entityName: nameMap.get(eq.entity_id) ?? 'Unknown',
        equipmentId: eq.id,
        equipmentName: eq.name,
        verified: eq.verification_status === 'approved',
      });
    }

    if (matches.length > 0) {
      result[gear.id] = matches;
    }
  }

  return result;
}

/**
 * One-click: set an event gear item's source to 'crew' and mark the
 * corresponding deal_crew row as brings_own_gear = true.
 */
export async function sourceGearFromCrew(input: {
  eventGearItemId: string;
  suppliedByEntityId: string;
  kitFee?: number;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = z
    .object({
      eventGearItemId: z.string().uuid(),
      suppliedByEntityId: z.string().uuid(),
      kitFee: z.number().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  // Verify gear item belongs to this workspace
  const { data: gearItem, error: gearErr } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('id, event_id, catalog_package_id')
    .eq('id', parsed.data.eventGearItemId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (gearErr || !gearItem) {
    return { success: false, error: 'Gear item not found.' };
  }

  // Verify entity belongs to this workspace (via directory.entities.owner_workspace_id)
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('id', parsed.data.suppliedByEntityId)
    .eq('owner_workspace_id', workspaceId)
    .maybeSingle();

  if (!entity) {
    return { success: false, error: 'Entity not found in workspace.' };
  }

  // I1 fix: Verify entity has approved equipment matching the gear item's catalog ID
  const gearCatalogId = (gearItem as { catalog_package_id?: string | null }).catalog_package_id;
  if (gearCatalogId) {
    const { data: approvedEquip } = await supabase
      .schema('ops')
      .from('crew_equipment')
      .select('id')
      .eq('entity_id', parsed.data.suppliedByEntityId)
      .eq('workspace_id', workspaceId)
      .eq('catalog_item_id', gearCatalogId)
      .eq('verification_status', 'approved')
      .limit(1);

    if (!approvedEquip || approvedEquip.length === 0) {
      return { success: false, error: 'Crew member does not have approved equipment matching this item.' };
    }
  }

  // Update gear item source
  const { error: updateErr } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .update({
      source: 'crew',
      supplied_by_entity_id: parsed.data.suppliedByEntityId,
      kit_fee: parsed.data.kitFee ?? null,
    })
    .eq('id', parsed.data.eventGearItemId)
    .eq('workspace_id', workspaceId);

  if (updateErr) {
    return { success: false, error: updateErr.message };
  }

  // Flip brings_own_gear on the corresponding deal_crew row
  // Resolve deal_id from the event
  const eventId = (gearItem as { event_id: string }).event_id;
  const { data: evt } = await supabase
    .schema('ops')
    .from('events')
    .select('deal_id')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const dealId = (evt?.deal_id as string) ?? null;
  if (dealId) {
    await supabase
      .schema('ops')
      .from('deal_crew')
      .update({ brings_own_gear: true })
      .eq('deal_id', dealId)
      .eq('entity_id', parsed.data.suppliedByEntityId)
      .eq('workspace_id', workspaceId);
  }

  return { success: true };
}

/**
 * Reverts a crew-sourced gear item back to company source.
 */
export async function unsourceGearFromCrew(input: {
  eventGearItemId: string;
}): Promise<{ success: boolean; error?: string }> {
  const parsed = z
    .object({ eventGearItemId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid gear item ID.' };
  }

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .update({
      source: 'company',
      supplied_by_entity_id: null,
      kit_fee: null,
    })
    .eq('id', parsed.data.eventGearItemId)
    .eq('workspace_id', workspaceId);

  if (error) {
    return { success: false, error: error.message };
  }

  return { success: true };
}
