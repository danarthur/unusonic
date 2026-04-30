'use server';

/**
 * Crew gear / owned-kit actions.
 *
 * Extracted from crew-hub.ts (Phase 0.5-style split, 2026-04-29). Owns:
 *   - getCrewSuppliedGear: items this crew member is bringing to this event.
 *   - getCrewOwnedKit: the person's approved kit, with already-on-event flags.
 *   - bringKitItemsToEvent: bulk-add selected kit items as crew-sourced gear.
 */

import { z } from 'zod/v4';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { addGearItem, type EventGearItem } from '../event-gear-items';
import type { CrewOwnedKit } from './types';

function coreFieldsFrom(r: Record<string, unknown>) {
  return {
    id: r.id as string,
    event_id: r.event_id as string,
    name: r.name as string,
    quantity: r.quantity as number,
    status: r.status as EventGearItem['status'],
    catalog_package_id: (r.catalog_package_id as string | null) ?? null,
    is_sub_rental: Boolean(r.is_sub_rental),
    sub_rental_supplier_id: (r.sub_rental_supplier_id as string | null) ?? null,
    department: (r.department as string | null) ?? null,
    operator_entity_id: (r.operator_entity_id as string | null) ?? null,
    sort_order: (r.sort_order as number) ?? 0,
    history: (r.history as EventGearItem['history']) ?? [],
    created_at: r.created_at as string,
  };
}

function sourceFieldsFrom(r: Record<string, unknown>) {
  return {
    source: (r.source as EventGearItem['source']) ?? 'company',
    supplied_by_entity_id: (r.supplied_by_entity_id as string | null) ?? null,
    supplied_by_name: null,
    kit_fee: r.kit_fee != null ? Number(r.kit_fee) : null,
  };
}

function lineageFieldsFrom(r: Record<string, unknown>) {
  return {
    proposal_item_id: (r.proposal_item_id as string | null) ?? null,
    parent_gear_item_id: (r.parent_gear_item_id as string | null) ?? null,
    lineage_source: (r.lineage_source as EventGearItem['lineage_source']) ?? 'pm_added',
    is_package_parent: Boolean(r.is_package_parent),
    package_instance_id: (r.package_instance_id as string | null) ?? null,
    package_snapshot: (r.package_snapshot as Record<string, unknown> | null) ?? null,
  };
}

function rowToCrewSuppliedGear(r: Record<string, unknown>): EventGearItem {
  return { ...coreFieldsFrom(r), ...sourceFieldsFrom(r), ...lineageFieldsFrom(r) };
}

// =============================================================================
// getCrewSuppliedGear — items this crew member is bringing to this event
//
// Filters ops.event_gear_items by event_id + supplied_by_entity_id. Used to
// fill the "Bringing to this show" list in the Crew Detail Rail.
// =============================================================================

export async function getCrewSuppliedGear(input: {
  eventId: string;
  entityId: string;
}): Promise<EventGearItem[]> {
  const parsed = z
    .object({ eventId: z.string().uuid(), entityId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema('ops')
      .from('event_gear_items')
      .select(
        'id, event_id, name, quantity, status, catalog_package_id, is_sub_rental, sub_rental_supplier_id, department, operator_entity_id, sort_order, history, created_at, source, supplied_by_entity_id, kit_fee, proposal_item_id, parent_gear_item_id, lineage_source, is_package_parent, package_instance_id, package_snapshot',
      )
      .eq('event_id', parsed.data.eventId)
      .eq('workspace_id', workspaceId)
      .eq('supplied_by_entity_id', parsed.data.entityId)
      .order('sort_order', { ascending: true });

    if (error) {
      Sentry.logger.error('crm.crewHub.getCrewSuppliedGearFailed', {
        eventId: parsed.data.eventId,
        entityId: parsed.data.entityId,
        error: error.message,
      });
      return [];
    }

    // supplied_by_name is enriched at the UI layer when needed — we already
    // know the name in the rail.
    return ((data ?? []) as Record<string, unknown>[]).map(rowToCrewSuppliedGear);
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getCrewSuppliedGear' } });
    return [];
  }
}

// =============================================================================
// getCrewOwnedKit — the person's approved ops.crew_equipment, with a per-item
// flag showing whether it's already on this event.
//
// Powers the "Bring from kit" picker in the rail. Skips rejected / pending
// equipment so the PM only sees what the workspace has actually verified.
// =============================================================================

export async function getCrewOwnedKit(input: {
  entityId: string;
  eventId: string | null;
}): Promise<CrewOwnedKit[]> {
  const parsed = z
    .object({
      entityId: z.string().uuid(),
      eventId: z.string().uuid().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();

    // Approved kit items
    const { data: kitRows, error: kitErr } = await supabase
      .schema('ops')
      .from('crew_equipment')
      .select('id, name, category, quantity, catalog_item_id, verification_status')
      .eq('entity_id', parsed.data.entityId)
      .eq('workspace_id', workspaceId)
      .eq('verification_status', 'approved')
      .order('category', { ascending: true });

    if (kitErr) {
      Sentry.logger.error('crm.crewHub.getCrewOwnedKitFailed', {
        entityId: parsed.data.entityId,
        error: kitErr.message,
      });
      return [];
    }

    const kit = (kitRows ?? []) as {
      id: string;
      name: string;
      category: string;
      quantity: number;
      catalog_item_id: string | null;
      verification_status: string;
    }[];

    // Items already on this event for this supplier — so we can grey them out.
    const onEventCatalogIds = new Set<string>();
    const onEventNames = new Set<string>();
    if (parsed.data.eventId) {
      const { data: onEvent } = await supabase
        .schema('ops')
        .from('event_gear_items')
        .select('name, catalog_package_id')
        .eq('event_id', parsed.data.eventId)
        .eq('workspace_id', workspaceId)
        .eq('supplied_by_entity_id', parsed.data.entityId);

      for (const r of (onEvent ?? []) as { name: string; catalog_package_id: string | null }[]) {
        if (r.catalog_package_id) onEventCatalogIds.add(r.catalog_package_id);
        onEventNames.add(r.name.trim().toLowerCase());
      }
    }

    return kit.map((item) => {
      const alreadyOnEvent =
        (item.catalog_item_id && onEventCatalogIds.has(item.catalog_item_id)) ||
        onEventNames.has(item.name.trim().toLowerCase());
      return {
        equipmentId: item.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        catalogItemId: item.catalog_item_id,
        verificationStatus: item.verification_status,
        alreadyOnEvent: Boolean(alreadyOnEvent),
      };
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getCrewOwnedKit' } });
    return [];
  }
}

// =============================================================================
// bringKitItemsToEvent — bulk-add selected crew_equipment items to this event
// as crew-sourced event_gear_items. Idempotent: silently skips items that
// already exist for this supplier (name OR catalog match).
// =============================================================================

const BringKitItemsSchema = z.object({
  eventId: z.string().uuid(),
  entityId: z.string().uuid(),
  equipmentIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function bringKitItemsToEvent(input: {
  eventId: string;
  entityId: string;
  equipmentIds: string[];
}): Promise<{ success: true; created: number; skipped: number } | { success: false; error: string }> {
  const parsed = BringKitItemsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();

    // Fetch the kit items we're about to add
    const { data: kitRows, error: kitErr } = await supabase
      .schema('ops')
      .from('crew_equipment')
      .select('id, name, category, quantity, catalog_item_id, verification_status')
      .in('id', parsed.data.equipmentIds)
      .eq('entity_id', parsed.data.entityId)
      .eq('workspace_id', workspaceId);

    if (kitErr || !kitRows || kitRows.length === 0) {
      return { success: false, error: 'Kit items not found.' };
    }

    // Existing event_gear_items for this supplier on this event — dedupe set
    const { data: existing } = await supabase
      .schema('ops')
      .from('event_gear_items')
      .select('name, catalog_package_id')
      .eq('event_id', parsed.data.eventId)
      .eq('workspace_id', workspaceId)
      .eq('supplied_by_entity_id', parsed.data.entityId);

    const existingCatalogIds = new Set<string>();
    const existingNames = new Set<string>();
    for (const r of (existing ?? []) as { name: string; catalog_package_id: string | null }[]) {
      if (r.catalog_package_id) existingCatalogIds.add(r.catalog_package_id);
      existingNames.add(r.name.trim().toLowerCase());
    }

    let created = 0;
    let skipped = 0;
    for (const item of kitRows as {
      id: string;
      name: string;
      category: string;
      quantity: number;
      catalog_item_id: string | null;
      verification_status: string;
    }[]) {
      if (item.verification_status !== 'approved') {
        skipped += 1;
        continue;
      }
      if (item.catalog_item_id && existingCatalogIds.has(item.catalog_item_id)) {
        skipped += 1;
        continue;
      }
      if (existingNames.has(item.name.trim().toLowerCase())) {
        skipped += 1;
        continue;
      }

      // addGearItem validates workspace membership + RLS. source='crew' +
      // supplied_by_entity_id produce a crew-attributed row. catalog_item_id
      // links back to the package so kit compliance stays accurate.
      // addGearItem returns `{ id } | { error }` (no `success` field).
      const result = await addGearItem(parsed.data.eventId, {
        name: item.name,
        quantity: item.quantity,
        catalog_package_id: item.catalog_item_id ?? undefined,
        source: 'crew',
        supplied_by_entity_id: parsed.data.entityId,
      });

      if ('id' in result) {
        created += 1;
        if (item.catalog_item_id) existingCatalogIds.add(item.catalog_item_id);
        existingNames.add(item.name.trim().toLowerCase());
      } else {
        skipped += 1;
      }
    }

    // Reflect on deal_crew — brings_own_gear=true when at least one item landed.
    if (created > 0) {
      const { data: evt } = await supabase
        .schema('ops')
        .from('events')
        .select('deal_id')
        .eq('id', parsed.data.eventId)
        .maybeSingle();
      const dealId = (evt?.deal_id as string) ?? null;
      if (dealId) {
        await supabase
          .schema('ops')
          .from('deal_crew')
          .update({ brings_own_gear: true })
          .eq('deal_id', dealId)
          .eq('entity_id', parsed.data.entityId)
          .eq('workspace_id', workspaceId);
      }
    }

    return { success: true, created, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'bringKitItemsToEvent' } });
    return { success: false, error: message };
  }
}
