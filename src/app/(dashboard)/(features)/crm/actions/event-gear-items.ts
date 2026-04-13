'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import type {
  GearStatus,
  GearHistoryEntry,
} from '../components/flight-checks/types';

// =============================================================================
// Types
// =============================================================================

export type GearSource = 'company' | 'crew' | 'subrental';

export type EventGearItem = {
  id: string;
  event_id: string;
  name: string;
  quantity: number;
  status: GearStatus;
  catalog_package_id: string | null;
  is_sub_rental: boolean;
  sub_rental_supplier_id: string | null;
  department: string | null;
  operator_entity_id: string | null;
  sort_order: number;
  history: GearHistoryEntry[];
  created_at: string;
  // Phase 3: Source tracking
  source: GearSource;
  supplied_by_entity_id: string | null;
  supplied_by_name: string | null;
  kit_fee: number | null;
};

export type GearAvailability = {
  stockQuantity: number | null;
  allocated: number;
  available: number;
};

// =============================================================================
// Validation schemas
// =============================================================================

const VALID_GEAR_STATUSES: [string, ...string[]] = [
  'allocated',
  'pulled',
  'packed',
  'loaded',
  'on_site',
  'returned',
  'quarantine',
  'sub_rented',
];

const AddGearItemSchema = z.object({
  name: z.string().min(1, 'Name is required').max(200),
  quantity: z.number().int().min(1).optional().default(1),
  department: z.string().max(100).optional(),
  catalog_package_id: z.string().uuid().optional(),
  is_sub_rental: z.boolean().optional().default(false),
  source: z.enum(['company', 'crew', 'subrental']).optional().default('company'),
  supplied_by_entity_id: z.string().uuid().optional(),
  kit_fee: z.number().optional(),
});

const GearStatusSchema = z.enum(VALID_GEAR_STATUSES as [string, ...string[]]);

// =============================================================================
// getEventGearItems
// =============================================================================

export async function getEventGearItems(
  eventId: string,
): Promise<EventGearItem[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select(
      'id, event_id, name, quantity, status, catalog_package_id, is_sub_rental, sub_rental_supplier_id, department, operator_entity_id, sort_order, history, created_at, source, supplied_by_entity_id, kit_fee',
    )
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[CRM] getEventGearItems:', error.message);
    return [];
  }

  // Resolve supplier names for crew-sourced items
  const supplierIds = (data ?? [])
    .map((r: Record<string, unknown>) => r.supplied_by_entity_id as string | null)
    .filter((id): id is string => !!id);
  const supplierNameMap = new Map<string, string>();
  if (supplierIds.length > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name, attributes')
      .in('id', [...new Set(supplierIds)]);
    for (const e of (entities ?? []) as { id: string; display_name: string | null; attributes: Record<string, unknown> | null }[]) {
      const attrs = readEntityAttrs(e.attributes, 'person');
      const fullName = [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim();
      supplierNameMap.set(e.id, fullName || e.display_name || 'Unknown');
    }
  }

  return (data ?? []).map((row: Record<string, unknown>) => ({
    id: row.id as string,
    event_id: row.event_id as string,
    name: row.name as string,
    quantity: (row.quantity as number) ?? 1,
    status: (row.status as GearStatus) ?? 'allocated',
    catalog_package_id: (row.catalog_package_id as string | null) ?? null,
    is_sub_rental: (row.is_sub_rental as boolean) ?? false,
    sub_rental_supplier_id:
      (row.sub_rental_supplier_id as string | null) ?? null,
    department: (row.department as string | null) ?? null,
    operator_entity_id: (row.operator_entity_id as string | null) ?? null,
    sort_order: (row.sort_order as number) ?? 0,
    history: Array.isArray(row.history)
      ? (row.history as GearHistoryEntry[])
      : [],
    created_at: row.created_at as string,
    source: (row.source as GearSource) ?? 'company',
    supplied_by_entity_id: (row.supplied_by_entity_id as string | null) ?? null,
    supplied_by_name: row.supplied_by_entity_id
      ? (supplierNameMap.get(row.supplied_by_entity_id as string) ?? null)
      : null,
    kit_fee: row.kit_fee != null ? Number(row.kit_fee) : null,
  }));
}

// =============================================================================
// addGearItem
// =============================================================================

export async function addGearItem(
  eventId: string,
  item: {
    name: string;
    quantity?: number;
    department?: string;
    catalog_package_id?: string;
    is_sub_rental?: boolean;
    source?: GearSource;
    supplied_by_entity_id?: string;
    kit_fee?: number;
  },
): Promise<{ id: string } | { error: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { error: 'No active workspace.' };

  const parsed = AddGearItemSchema.safeParse(item);
  if (!parsed.success) {
    return { error: parsed.error.issues.map((i) => i.message).join(', ') };
  }

  const supabase = await createClient();

  // Determine next sort_order
  const { data: existing } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('sort_order')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: false })
    .limit(1);

  const maxSort =
    existing && existing.length > 0
      ? (existing[0] as { sort_order: number }).sort_order
      : -1;

  const { data, error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .insert({
      event_id: eventId,
      workspace_id: workspaceId,
      name: parsed.data.name,
      quantity: parsed.data.quantity,
      status: 'allocated' as const,
      catalog_package_id: parsed.data.catalog_package_id ?? null,
      is_sub_rental: parsed.data.is_sub_rental,
      department: parsed.data.department ?? null,
      sort_order: maxSort + 1,
      source: parsed.data.source,
      supplied_by_entity_id: parsed.data.supplied_by_entity_id ?? null,
      kit_fee: parsed.data.kit_fee ?? null,
    })
    .select('id')
    .single();

  if (error) {
    console.error('[CRM] addGearItem:', error.message);
    return { error: error.message };
  }

  return { id: (data as { id: string }).id };
}

// =============================================================================
// removeGearItem
// =============================================================================

export async function removeGearItem(
  gearItemId: string,
): Promise<{ success: boolean; error?: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .delete()
    .eq('id', gearItemId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] removeGearItem:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// =============================================================================
// updateGearItemStatus
// =============================================================================

export async function updateGearItemStatus(
  gearItemId: string,
  newStatus: GearStatus,
  changedBy: string,
): Promise<{ success: boolean; error?: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const statusParsed = GearStatusSchema.safeParse(newStatus);
  if (!statusParsed.success) {
    return { success: false, error: 'Invalid gear status.' };
  }

  const supabase = await createClient();

  // Read current row to get existing history
  const { data: current, error: readErr } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('history')
    .eq('id', gearItemId)
    .eq('workspace_id', workspaceId)
    .single();

  if (readErr || !current) {
    return { success: false, error: readErr?.message ?? 'Gear item not found.' };
  }

  const existingHistory: GearHistoryEntry[] = Array.isArray(
    (current as Record<string, unknown>).history,
  )
    ? ((current as Record<string, unknown>).history as GearHistoryEntry[])
    : [];

  const newEntry: GearHistoryEntry = {
    status: statusParsed.data as GearStatus,
    changed_at: new Date().toISOString(),
    changed_by: changedBy,
  };

  // Append new entry and cap at 20 most recent
  const updatedHistory = [...existingHistory, newEntry].slice(-20);

  const { error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .update({
      status: statusParsed.data,
      status_updated_at: new Date().toISOString(),
      status_updated_by: changedBy,
      history: updatedHistory,
    })
    .eq('id', gearItemId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] updateGearItemStatus:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// =============================================================================
// assignGearOperator
// =============================================================================

export async function assignGearOperator(
  gearItemId: string,
  entityId: string | null,
): Promise<{ success: boolean; error?: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  if (entityId !== null) {
    const uuidParsed = z.string().uuid().safeParse(entityId);
    if (!uuidParsed.success) {
      return { success: false, error: 'Invalid entity ID.' };
    }
  }

  const supabase = await createClient();

  const { error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .update({ operator_entity_id: entityId })
    .eq('id', gearItemId)
    .eq('workspace_id', workspaceId);

  if (error) {
    console.error('[CRM] assignGearOperator:', error.message);
    return { success: false, error: error.message };
  }

  return { success: true };
}

// =============================================================================
// getGearAvailability
// =============================================================================

export async function getGearAvailability(
  catalogPackageId: string,
  startDate: string,
  endDate: string,
): Promise<GearAvailability> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { stockQuantity: null, allocated: 0, available: 0 };
  }

  const supabase = await createClient();

  // Get stock quantity from the catalog package
  const { data: pkg } = await supabase
    .from('packages')
    .select('stock_quantity')
    .eq('id', catalogPackageId)
    .eq('workspace_id', workspaceId)
    .single();

  const stockQuantity = (pkg as { stock_quantity: number | null } | null)
    ?.stock_quantity ?? null;

  // Count allocated quantity across overlapping events
  // Join event_gear_items → ops.events to find date overlap
  const { data: allocations, error: allocErr } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select(
      'quantity, event:events!inner(starts_at, ends_at)',
    )
    .eq('catalog_package_id', catalogPackageId)
    .eq('workspace_id', workspaceId);

  if (allocErr) {
    console.error('[CRM] getGearAvailability:', allocErr.message);
    return { stockQuantity, allocated: 0, available: stockQuantity ?? 0 };
  }

  // Filter to overlapping events client-side (Supabase doesn't support
  // cross-column range overlap filters via PostgREST easily)
  const start = new Date(startDate);
  const end = new Date(endDate);
  let allocated = 0;

  for (const row of allocations ?? []) {
    const event = (row as Record<string, unknown>).event as {
      starts_at: string | null;
      ends_at: string | null;
    } | null;
    if (!event?.starts_at || !event?.ends_at) continue;

    const eventStart = new Date(event.starts_at);
    const eventEnd = new Date(event.ends_at);

    // Overlap check: events overlap if eventStart < end AND eventEnd > start
    if (eventStart < end && eventEnd > start) {
      allocated += (row as { quantity: number }).quantity ?? 0;
    }
  }

  return {
    stockQuantity,
    allocated,
    available: stockQuantity !== null ? stockQuantity - allocated : 0,
  };
}

// =============================================================================
// batchGetGearAvailability
// =============================================================================

export async function batchGetGearAvailability(
  items: { catalogPackageId: string; startDate: string; endDate: string }[],
): Promise<Map<string, GearAvailability>> {
  const results = new Map<string, GearAvailability>();
  if (items.length === 0) return results;

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    for (const item of items) {
      results.set(item.catalogPackageId, {
        stockQuantity: null,
        allocated: 0,
        available: 0,
      });
    }
    return results;
  }

  const supabase = await createClient();

  const uniquePackageIds = [...new Set(items.map((i) => i.catalogPackageId))];

  // Batch fetch stock quantities
  const { data: packages } = await supabase
    .from('packages')
    .select('id, stock_quantity')
    .in('id', uniquePackageIds)
    .eq('workspace_id', workspaceId);

  const stockMap = new Map<string, number | null>();
  for (const pkg of packages ?? []) {
    const p = pkg as { id: string; stock_quantity: number | null };
    stockMap.set(p.id, p.stock_quantity);
  }

  // Batch fetch all allocations for these package IDs
  const { data: allocations, error: allocErr } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select(
      'catalog_package_id, quantity, event:events!inner(starts_at, ends_at)',
    )
    .in('catalog_package_id', uniquePackageIds)
    .eq('workspace_id', workspaceId);

  if (allocErr) {
    console.error('[CRM] batchGetGearAvailability:', allocErr.message);
  }

  // For each requested item, compute availability
  for (const item of items) {
    const stockQuantity = stockMap.get(item.catalogPackageId) ?? null;
    let allocated = 0;

    if (!allocErr && allocations) {
      const start = new Date(item.startDate);
      const end = new Date(item.endDate);

      for (const row of allocations) {
        const r = row as unknown as {
          catalog_package_id: string | null;
          quantity: number;
          event: { starts_at: string | null; ends_at: string | null } | null;
        };
        if (r.catalog_package_id !== item.catalogPackageId) continue;
        if (!r.event?.starts_at || !r.event?.ends_at) continue;

        const eventStart = new Date(r.event.starts_at);
        const eventEnd = new Date(r.event.ends_at);

        if (eventStart < end && eventEnd > start) {
          allocated += r.quantity ?? 0;
        }
      }
    }

    results.set(item.catalogPackageId, {
      stockQuantity,
      allocated,
      available: stockQuantity !== null ? stockQuantity - allocated : 0,
    });
  }

  return results;
}

// =============================================================================
// Types: Crew gear matching
// =============================================================================

export type CrewGearMatch = {
  entityId: string;
  entityName: string;
  equipmentId: string;
  equipmentName: string;
  verified: boolean;
};

// =============================================================================
// getCrewEquipmentMatchesForEvent
//
// Cross-references assigned crew equipment profiles against event gear items
// via catalog_item_id / catalog_package_id. Returns a map keyed by event gear
// item ID with an array of matching crew members who own that equipment.
// =============================================================================

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

// =============================================================================
// sourceGearFromCrew
//
// One-click: set an event gear item's source to 'crew' and mark the
// corresponding deal_crew row as brings_own_gear = true.
// =============================================================================

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

// =============================================================================
// unsourceGearFromCrew
//
// Reverts a crew-sourced gear item back to company source.
// =============================================================================

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

// =============================================================================
// Cross-Event Equipment Roll-Up
//
// Returns all crew-sourced event gear items across upcoming events (next N
// days, default 30) for the active workspace, grouped by crew member.
// Useful for PMs to see "across all my upcoming shows, what gear is being
// sourced from crew?"
// =============================================================================

export type CrewEquipmentRollupEntry = {
  entityId: string;
  entityName: string;
  events: {
    eventId: string;
    eventTitle: string;
    eventDate: string;
    items: { name: string; quantity: number }[];
  }[];
};

export async function getCrewSourcedEquipmentRollup(
  options: { daysAhead?: number } = {},
): Promise<CrewEquipmentRollupEntry[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const daysAhead = options.daysAhead ?? 30;
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const supabase = await createClient();

  // 1. Get upcoming events in the workspace within the date range
  const { data: events } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at')
    .eq('workspace_id', workspaceId)
    .gte('starts_at', now.toISOString())
    .lte('starts_at', cutoff.toISOString())
    .order('starts_at', { ascending: true });

  type EventRow = { id: string; title: string | null; starts_at: string };
  const eventRows: EventRow[] = (events ?? []) as EventRow[];
  if (eventRows.length === 0) return [];

  const eventIds = eventRows.map((e) => e.id);

  // 2. Get all crew-sourced gear items for these events
  const { data: gearItems } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('event_id, name, quantity, supplied_by_entity_id')
    .eq('workspace_id', workspaceId)
    .eq('source', 'crew')
    .in('event_id', eventIds)
    .not('supplied_by_entity_id', 'is', null);

  type GearRow = {
    event_id: string;
    name: string;
    quantity: number;
    supplied_by_entity_id: string;
  };
  const gearRows: GearRow[] = (gearItems ?? []) as GearRow[];
  if (gearRows.length === 0) return [];

  // 3. Resolve entity names
  const entityIds = [...new Set(gearRows.map((g) => g.supplied_by_entity_id))];
  const { data: entities } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, attributes')
    .in('id', entityIds);

  const nameMap = new Map<string, string>();
  for (const e of (entities ?? []) as { id: string; display_name: string | null; attributes: Record<string, unknown> | null }[]) {
    const attrs = readEntityAttrs(e.attributes, 'person');
    const fullName = [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim();
    nameMap.set(e.id, fullName || e.display_name || 'Unknown');
  }

  // 4. Build event lookup
  const eventMap = new Map<string, EventRow>();
  for (const ev of eventRows) eventMap.set(ev.id, ev);

  // 5. Group by entity, then by event
  const grouped = new Map<string, Map<string, { name: string; quantity: number }[]>>();

  for (const gear of gearRows) {
    if (!grouped.has(gear.supplied_by_entity_id)) {
      grouped.set(gear.supplied_by_entity_id, new Map());
    }
    const entityEvents = grouped.get(gear.supplied_by_entity_id)!;
    if (!entityEvents.has(gear.event_id)) {
      entityEvents.set(gear.event_id, []);
    }
    entityEvents.get(gear.event_id)!.push({
      name: gear.name,
      quantity: gear.quantity,
    });
  }

  // 6. Build result
  const result: CrewEquipmentRollupEntry[] = [];

  for (const [entityId, eventItems] of grouped) {
    const evts: CrewEquipmentRollupEntry['events'] = [];
    for (const [eventId, items] of eventItems) {
      const ev = eventMap.get(eventId);
      if (!ev) continue;
      evts.push({
        eventId,
        eventTitle: ev.title ?? 'Untitled event',
        eventDate: ev.starts_at,
        items,
      });
    }
    // Sort events by date
    evts.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    result.push({
      entityId,
      entityName: nameMap.get(entityId) ?? 'Unknown',
      events: evts,
    });
  }

  // Sort by entity name
  result.sort((a, b) => a.entityName.localeCompare(b.entityName));

  return result;
}
