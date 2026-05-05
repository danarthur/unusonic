'use server';

/**
 * event-gear-items/availability.ts — stock vs allocation arithmetic for
 * catalog packages, single + batch.
 *
 * Joins ops.event_gear_items → ops.events for date-overlap math, and reads
 * public.packages for stock_quantity.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { GearAvailability } from './types';

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
