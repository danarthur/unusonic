'use server';

import { createClient } from '@/shared/api/supabase/server';

export interface AllocationDetail {
  dealId: string;
  dealTitle: string;
  dealStatus: string;
  proposedDate: string;
  quantityAllocated: number;
}

export interface ItemAvailability {
  status: 'available' | 'tight' | 'shortage';
  stockQuantity: number;
  totalAllocated: number;
  available: number;
  conflicts: AllocationDetail[];
}

/**
 * Check availability of a single catalog item on a given date.
 * Uses a 3-day window around the proposed date to catch adjacent bookings.
 */
export async function checkItemAvailability(
  workspaceId: string,
  packageId: string,
  proposedDate: string
): Promise<ItemAvailability> {
  const supabase = await createClient();

  // Get the package to check stock_quantity and confirm it's rental
  const { data: pkg } = await supabase
    .from('packages')
    .select('id, stock_quantity, category')
    .eq('id', packageId)
    .single();

  if (!pkg || pkg.category !== 'rental') {
    return { status: 'available', stockQuantity: 0, totalAllocated: 0, available: 0, conflicts: [] };
  }

  const stock = Number(pkg.stock_quantity) || 0;

  // Query allocations on the same date
  const date = new Date(proposedDate);
  const dateStr = date.toISOString().split('T')[0];

  const { data: allocations } = await supabase.rpc('get_catalog_availability', {
    p_workspace_id: workspaceId,
    p_date_start: dateStr,
    p_date_end: dateStr,
  });

  // Filter to this specific package
  const itemAllocations = (allocations ?? []).filter(
    (a: { catalog_package_id: string }) => a.catalog_package_id === packageId
  );

  const totalAllocated = itemAllocations.reduce(
    (sum: number, a: { quantity_allocated: number }) => sum + (a.quantity_allocated || 0),
    0
  );

  const available = Math.max(0, stock - totalAllocated);
  const conflicts: AllocationDetail[] = itemAllocations.map(
    (a: { deal_id: string; deal_title: string; deal_status: string; proposed_date: string; quantity_allocated: number }) => ({
      dealId: a.deal_id,
      dealTitle: a.deal_title ?? 'Untitled',
      dealStatus: a.deal_status ?? 'unknown',
      proposedDate: a.proposed_date,
      quantityAllocated: a.quantity_allocated,
    })
  );

  let status: 'available' | 'tight' | 'shortage' = 'available';
  if (available <= 0) {
    status = 'shortage';
  } else if (available <= Math.ceil(stock * 0.25)) {
    // Tight when 25% or less remaining
    status = 'tight';
  }

  return { status, stockQuantity: stock, totalAllocated, available, conflicts };
}

/**
 * Batch check availability for multiple rental items on a date.
 * More efficient than calling checkItemAvailability for each item.
 */
/**
 * Fetch all rental item allocations across a date range.
 * Returns one row per (catalog_package_id, deal_id, proposed_date) combination.
 * Used by the Catalog Timeline (Gantt) view.
 */
export interface DateAllocation {
  catalogPackageId: string;
  dealId: string;
  dealTitle: string;
  dealStatus: string;
  proposedDate: string;
  quantityAllocated: number;
  stockQuantity: number;
}

export async function getCatalogAvailabilityRange(
  workspaceId: string,
  dateStart: string,
  dateEnd: string
): Promise<DateAllocation[]> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc('get_catalog_availability', {
    p_workspace_id: workspaceId,
    p_date_start: dateStart,
    p_date_end: dateEnd,
  });
  if (error || !data) return [];
  return (data as any[]).map((r) => ({
    catalogPackageId: r.catalog_package_id,
    dealId: r.deal_id,
    dealTitle: r.deal_title ?? 'Untitled',
    dealStatus: r.deal_status ?? 'unknown',
    proposedDate: r.proposed_date,
    quantityAllocated: r.quantity_allocated,
    stockQuantity: r.stock_quantity,
  }));
}

/**
 * Batch check availability for multiple rental items on a date.
 * More efficient than calling checkItemAvailability for each item.
 */
export async function checkBatchAvailability(
  workspaceId: string,
  packageIds: string[],
  proposedDate: string
): Promise<Record<string, ItemAvailability>> {
  const supabase = await createClient();
  const result: Record<string, ItemAvailability> = {};

  if (packageIds.length === 0 || !proposedDate) return result;

  // Get all rental packages in the batch
  const { data: pkgs } = await supabase
    .from('packages')
    .select('id, stock_quantity, category')
    .in('id', packageIds)
    .eq('category', 'rental');

  const rentalPkgs = new Map<string, number>();
  for (const pkg of pkgs ?? []) {
    rentalPkgs.set(pkg.id, Number(pkg.stock_quantity) || 0);
  }

  if (rentalPkgs.size === 0) return result;

  const dateStr = new Date(proposedDate).toISOString().split('T')[0];

  const { data: allocations } = await supabase.rpc('get_catalog_availability', {
    p_workspace_id: workspaceId,
    p_date_start: dateStr,
    p_date_end: dateStr,
  });

  // Group allocations by package
  const allocationsByPkg = new Map<string, AllocationDetail[]>();
  const totalsByPkg = new Map<string, number>();

  for (const a of allocations ?? []) {
    const pkgId = (a as { catalog_package_id: string }).catalog_package_id;
    if (!rentalPkgs.has(pkgId)) continue;

    const detail: AllocationDetail = {
      dealId: (a as { deal_id: string }).deal_id,
      dealTitle: (a as { deal_title: string }).deal_title ?? 'Untitled',
      dealStatus: (a as { deal_status: string }).deal_status ?? 'unknown',
      proposedDate: (a as { proposed_date: string }).proposed_date,
      quantityAllocated: (a as { quantity_allocated: number }).quantity_allocated,
    };

    const existing = allocationsByPkg.get(pkgId) ?? [];
    existing.push(detail);
    allocationsByPkg.set(pkgId, existing);

    totalsByPkg.set(pkgId, (totalsByPkg.get(pkgId) ?? 0) + detail.quantityAllocated);
  }

  // Build result for each requested rental package
  for (const [pkgId, stock] of rentalPkgs) {
    const totalAllocated = totalsByPkg.get(pkgId) ?? 0;
    const available = Math.max(0, stock - totalAllocated);
    const conflicts = allocationsByPkg.get(pkgId) ?? [];

    let status: 'available' | 'tight' | 'shortage' = 'available';
    if (available <= 0) {
      status = 'shortage';
    } else if (available <= Math.ceil(stock * 0.25)) {
      status = 'tight';
    }

    result[pkgId] = { status, stockQuantity: stock, totalAllocated, available, conflicts };
  }

  return result;
}
