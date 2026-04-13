/**
 * Proposal Builder — pure utility functions (no React dependency).
 * Extracted from proposal-builder.tsx for maintainability.
 */

import { computeHoursBetween } from '@/shared/lib/parse-time';
import type { ProposalWithItems, ProposalBuilderLineItem } from '../model/types';
import type { ProposalLineItemInput } from '../api/proposal-actions';

/** Map a UI line item to the server action input shape. Single source of truth — no duplicates. */
export function toLineItemInput(item: ProposalBuilderLineItem): ProposalLineItemInput {
  return {
    packageId: item.packageId ?? null,
    originPackageId: item.originPackageId ?? item.packageId ?? null,
    packageInstanceId: item.packageInstanceId ?? null,
    displayGroupName: item.displayGroupName ?? null,
    isClientVisible: item.isClientVisible ?? true,
    isPackageHeader: item.isPackageHeader ?? false,
    originalBasePrice: item.originalBasePrice ?? null,
    unitType: item.unitType ?? 'flat',
    unitMultiplier: item.unitMultiplier ?? 1,
    category: item.category ?? null,
    name: item.name,
    description: item.description ?? null,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    overridePrice: item.overridePrice ?? null,
    actualCost: item.actualCost ?? null,
    isOptional: item.isOptional ?? false,
    requiredRoles: item.requiredRoles ?? null,
    floorPrice: item.floorPrice ?? null,
    isTaxable: item.isTaxable ?? null,
    timeStart: item.timeStart ?? null,
    timeEnd: item.timeEnd ?? null,
    showTimesOnProposal: item.showTimesOnProposal ?? true,
  };
}

/** Map raw proposal items from the DB into the UI line-item shape. */
export function mapProposalItemsToLineItems(
  initialProposal: ProposalWithItems | null | undefined,
  dealEventStartTime?: string | null,
  dealEventEndTime?: string | null,
): ProposalBuilderLineItem[] {
  if (!initialProposal?.items?.length) return [];
  return initialProposal.items.map((item) => {
    const row = item as {
      id?: string;
      package_id?: string | null;
      origin_package_id?: string | null;
      package_instance_id?: string | null;
      display_group_name?: string | null;
      is_client_visible?: boolean | null;
      is_package_header?: boolean | null;
      is_optional?: boolean | null;
      original_base_price?: number | null;
      unit_type?: string | null;
      unit_multiplier?: number | null;
      override_price?: number | null;
      actual_cost?: number | null;
      internal_notes?: string | null;
      unit_price?: number;
      name: string;
      description?: string | null;
      quantity: number;
      time_start?: string | null;
      time_end?: string | null;
      show_times_on_proposal?: boolean | null;
      definition_snapshot?: {
        margin_meta?: { category?: string };
        price_meta?: { floor_price?: number | null };
        tax_meta?: { is_taxable?: boolean | null };
        crew_meta?: { required_roles?: unknown[] | null };
      } | null;
    };
    const category = row.definition_snapshot?.margin_meta?.category as ProposalBuilderLineItem['category'] | undefined;
    const floorPrice = row.definition_snapshot?.price_meta?.floor_price ?? null;
    const isTaxable = row.definition_snapshot?.tax_meta?.is_taxable ?? null;

    const requiredRoles = (row.definition_snapshot?.crew_meta?.required_roles as any[] | null | undefined) ?? null;
    const unitType = (row.unit_type === 'hour' || row.unit_type === 'day' ? row.unit_type : 'flat') as ProposalBuilderLineItem['unitType'];
    const mapped: ProposalBuilderLineItem = {
      id: row.id,
      packageId: row.package_id ?? null,
      originPackageId: row.origin_package_id ?? null,
      packageInstanceId: row.package_instance_id ?? null,
      displayGroupName: row.display_group_name ?? null,
      isClientVisible: row.is_client_visible ?? true,
      isPackageHeader: row.is_package_header ?? false,
      isOptional: row.is_optional ?? false,
      originalBasePrice: row.original_base_price != null && Number.isFinite(Number(row.original_base_price)) ? Number(row.original_base_price) : null,
      unitType: unitType ?? 'flat',
      unitMultiplier: row.unit_multiplier != null && Number.isFinite(Number(row.unit_multiplier)) ? Number(row.unit_multiplier) : 1,
      category: category ?? null,
      name: row.name,
      description: row.description ?? null,
      quantity: row.quantity,
      unitPrice: Number(row.unit_price ?? 0),
      overridePrice: row.override_price != null ? Number(row.override_price) : null,
      actualCost: row.actual_cost != null ? Number(row.actual_cost) : null,
      floorPrice: floorPrice != null && Number.isFinite(Number(floorPrice)) ? Number(floorPrice) : null,
      isTaxable: isTaxable,
      internalNotes: row.internal_notes ?? null,
      requiredRoles: requiredRoles,
      timeStart: row.time_start ?? null,
      timeEnd: row.time_end ?? null,
      showTimesOnProposal: row.show_times_on_proposal ?? true,
    };

    // Auto-inherit deal event times for hourly items with no saved times
    if (unitType === 'hour' || unitType === 'day') {
      if (!mapped.timeStart && dealEventStartTime) mapped.timeStart = dealEventStartTime;
      if (!mapped.timeEnd && dealEventEndTime) mapped.timeEnd = dealEventEndTime;
    }
    // Auto-compute unitMultiplier from effective times for hourly items
    if (unitType === 'hour' && mapped.timeStart && mapped.timeEnd) {
      const hours = computeHoursBetween(mapped.timeStart, mapped.timeEnd);
      if (hours != null && hours > 0) mapped.unitMultiplier = hours;
    }

    return mapped;
  });
}

/** Group flat line items by package_instance_id for display (Tagged Bursting). */
export function groupLineItemsByPackageInstance(
  lineItems: ProposalBuilderLineItem[]
): { packageInstanceId: string | null; displayGroupName: string | null; indices: number[] }[] {
  const byKey = new Map<string, { packageInstanceId: string | null; displayGroupName: string | null; indices: number[] }>();
  lineItems.forEach((item, index) => {
    const key = item.packageInstanceId ?? `ungrouped-${index}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        packageInstanceId: item.packageInstanceId ?? null,
        displayGroupName: item.displayGroupName ?? null,
        indices: [],
      });
    }
    byKey.get(key)!.indices.push(index);
  });
  return Array.from(byKey.values());
}
