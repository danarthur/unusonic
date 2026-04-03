'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type {
  GearStatus,
  GearHistoryEntry,
} from '../components/flight-checks/types';

// =============================================================================
// Types
// =============================================================================

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
      'id, event_id, name, quantity, status, catalog_package_id, is_sub_rental, sub_rental_supplier_id, department, operator_entity_id, sort_order, history, created_at',
    )
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) {
    console.error('[CRM] getEventGearItems:', error.message);
    return [];
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
