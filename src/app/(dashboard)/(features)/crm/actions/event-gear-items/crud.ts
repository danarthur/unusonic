'use server';

/**
 * event-gear-items/crud.ts — basic CRUD + status/operator mutations on
 * `ops.event_gear_items`.
 *
 * Read: getEventGearItems
 * Write: addGearItem, removeGearItem, updateGearItemStatus, assignGearOperator
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import type {
  GearStatus,
  GearHistoryEntry,
} from '../../components/flight-checks/types';
import type { EventGearItem, GearLineageSource, GearSource } from './types';

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
      'id, event_id, name, quantity, status, catalog_package_id, is_sub_rental, sub_rental_supplier_id, department, operator_entity_id, sort_order, history, created_at, source, supplied_by_entity_id, kit_fee, proposal_item_id, parent_gear_item_id, lineage_source, is_package_parent, package_instance_id, package_snapshot',
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
    proposal_item_id: (row.proposal_item_id as string | null) ?? null,
    parent_gear_item_id: (row.parent_gear_item_id as string | null) ?? null,
    lineage_source: ((row.lineage_source as GearLineageSource | null) ?? 'pm_added') as GearLineageSource,
    is_package_parent: (row.is_package_parent as boolean) ?? false,
    package_instance_id: (row.package_instance_id as string | null) ?? null,
    package_snapshot: (row.package_snapshot as Record<string, unknown> | null) ?? null,
  }));
}

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
