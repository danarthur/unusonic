 
/**
 * Sales feature – Server Actions: packages, upsert proposal, publish proposal
 * @module features/sales/api/proposal-actions
 */

'use server';

import { unstable_noStore } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { Package } from '@/types/supabase';
import type { ProposalWithItems } from '../../model/types';
import { resolveRequiredRoles, type RequiredRole, type PackageDefinition } from '../package-types';
import { upsertEmbedding, observeUpsert, buildContextHeader } from '@/app/api/aion/lib/embeddings';

/** Base URL for public links (proposal, claim, etc.). Prefer NEXT_PUBLIC_APP_URL; on Vercel fall back to VERCEL_URL so links in emails are always absolute. */
function getPublicBaseUrl(): string {
  const app = process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (app) return app.replace(/\/$/, '');
  const vercel = process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return '';
}

/** Minimal shape for package definition.blocks when expanding to line items. */
type DefinitionBlock =
  | { type: 'line_item'; catalogId: string; quantity: number }
  | { type: 'line_item_group'; items: string[] };

// =============================================================================
// Types for action input/output
// =============================================================================

export type ProposalLineItemCategory =
  | 'package'
  | 'service'
  | 'rental'
  | 'talent'
  | 'retail_sale'
  | 'fee';

export type UnitType = 'flat' | 'hour' | 'day';

export interface ProposalLineItemInput {
  /** When adding from catalog: pass for analytics only. Row data is copied; no live link (snapshot on insert). */
  packageId?: string | null;
  /** Explicit origin for analytics when packageId is not used (e.g. after deep copy). */
  originPackageId?: string | null;
  packageInstanceId?: string | null;
  displayGroupName?: string | null;
  isClientVisible?: boolean | null;
  /** Billing basis: flat (qty × price), hour (qty × hrs × price/hr), day (qty × days × price/day). */
  unitType?: UnitType | null;
  /** Hours or days per unit when unitType is hour/day; default 1. */
  unitMultiplier?: number | null;
  /** Category snapshot for cost editability rules in Financial Inspector. */
  category?: ProposalLineItemCategory | null;
  name: string;
  description?: string | null;
  quantity: number;
  unitPrice: number;
  /** Negotiated price for this client; falls back to unitPrice when null. */
  overridePrice?: number | null;
  /** Actual cost for this event (e.g. talent agreed to lower payout); used for margin. */
  actualCost?: number | null;
  /** PM-only note on this line item — not shown to the client. */
  internalNotes?: string | null;
  /** True for the bundle header row; children of that package have unit_price 0. */
  isPackageHeader?: boolean | null;
  /** Catalog price when added as package child; used when Unpack restores a la carte price. */
  originalBasePrice?: number | null;
  /** When true, client can toggle this item on/off in the proposal portal. */
  isOptional?: boolean | null;
  /** Crew roles snapshot — from package definition at add time. Editable for talent assignment in builder. */
  requiredRoles?: RequiredRole[] | null;
  /** Catalog floor price locked at proposal-add time. */
  floorPrice?: number | null;
  /** Whether this item is taxable (from package definition). */
  isTaxable?: boolean | null;
  /** Start time in HH:MM 24h format (e.g., "12:00"). For hourly/daily items. */
  timeStart?: string | null;
  /** End time in HH:MM 24h format (e.g., "16:00"). For hourly/daily items. */
  timeEnd?: string | null;
  /** When true, time range is shown on client-facing proposal. Default true. */
  showTimesOnProposal?: boolean | null;
}

export interface GetPackagesResult {
  packages: Package[];
  error?: string;
}

export interface UpsertProposalResult {
  proposalId: string | null;
  total: number;
  error?: string;
}

// =============================================================================
// getProposalForDeal(dealId): Latest proposal for this deal (Liquid phase; no event required)
// =============================================================================

export async function getProposalForDeal(dealId: string): Promise<ProposalWithItems | null> {
  unstable_noStore();
  const supabase = await createClient();
  const { data: proposals } = await supabase
    .from('proposals')
    .select('*')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false })
    .limit(1);
  if (!proposals?.length) return null;
  const proposal = proposals[0];
  const { data: items } = await supabase
    .from('proposal_items')
    .select('*')
    .eq('proposal_id', proposal.id)
    .order('sort_order', { ascending: true });
  return { ...proposal, items: items ?? [] };
}

// =============================================================================
// getProposalHistoryForDeal(dealId): All proposals for a deal, newest first (lightweight — no line items)
// =============================================================================

export type ProposalHistoryEntry = {
  id: string;
  status: string;
  created_at: string;
  updated_at: string;
  view_count: number;
  accepted_at: string | null;
  deposit_paid_at: string | null;
  deposit_percent: number | null;
  public_token: string | null;
  total: number;
  email_delivered_at: string | null;
  email_bounced_at: string | null;
};

export async function getProposalHistoryForDeal(dealId: string): Promise<ProposalHistoryEntry[]> {
  unstable_noStore();
  const supabase = await createClient();

  const { data: proposals } = await supabase
    .from('proposals')
    .select('id, status, created_at, updated_at, view_count, accepted_at, deposit_paid_at, deposit_percent, public_token, email_delivered_at, email_bounced_at')
    .eq('deal_id', dealId)
    .order('created_at', { ascending: false });

  if (!proposals?.length) return [];

  // Fetch totals: sum of (override_price ?? unit_price) * quantity per proposal
  const proposalIds = proposals.map((p) => p.id);
  const { data: items } = await supabase
    .from('proposal_items')
    .select('proposal_id, quantity, unit_price, override_price')
    .in('proposal_id', proposalIds);

  const totalByProposal = new Map<string, number>();
  for (const item of items ?? []) {
    const price = (item.override_price as number | null) ?? (item.unit_price as number) ?? 0;
    const qty = (item.quantity as number) ?? 1;
    const prev = totalByProposal.get(item.proposal_id as string) ?? 0;
    totalByProposal.set(item.proposal_id as string, prev + price * qty);
  }

  return proposals.map((p) => ({
    id: p.id,
    status: p.status,
    created_at: p.created_at,
    updated_at: p.updated_at,
    view_count: p.view_count,
    accepted_at: p.accepted_at ?? null,
    deposit_paid_at: p.deposit_paid_at ?? null,
    deposit_percent: p.deposit_percent ?? null,
    public_token: p.public_token ?? null,
    total: totalByProposal.get(p.id) ?? 0,
    email_delivered_at: (p as Record<string, unknown>).email_delivered_at as string | null ?? null,
    email_bounced_at: (p as Record<string, unknown>).email_bounced_at as string | null ?? null,
  }));
}

/** Return the public URL for the deal's sent proposal, or null. Use for "View shared link" so the token is always correct. */
export async function getProposalPublicUrl(dealId: string): Promise<string | null> {
  unstable_noStore();
  const supabase = await createClient();
  const { data: row } = await supabase
    .from('proposals')
    .select('public_token')
    .eq('deal_id', dealId)
    .in('status', ['sent', 'viewed', 'accepted'])
    .not('public_token', 'is', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const token = (row as { public_token?: string } | null)?.public_token;
  if (!token?.trim()) return null;
  const base = getPublicBaseUrl();
  return base ? `${base}/p/${token}` : `/p/${token}`;
}

/** Resolve event -> deal, then return latest proposal for that deal. Use for event-scoped deal room. */
export async function getProposalForEvent(eventId: string): Promise<ProposalWithItems | null> {
  const supabase = await createClient();
  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('event_id', eventId)
    .maybeSingle();
  if (!deal?.id) return null;
  return getProposalForDeal(deal.id);
}

// =============================================================================
// resolveWorkspaceIdForEvent(eventId): Used by upsert and addPackageToProposal
// =============================================================================

async function resolveWorkspaceIdForEvent(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string
): Promise<string | null> {
  const { data } = await supabase
    .schema('ops')
    .from('events')
    .select('workspace_id, project_id')
    .eq('id', eventId)
    .maybeSingle();
  const row = data as { workspace_id?: string | null; project_id?: string | null } | null;
  if (row?.workspace_id) return row.workspace_id;
  if (row?.project_id) {
    const { data: proj } = await supabase
      .schema('ops')
      .from('projects')
      .select('workspace_id')
      .eq('id', row.project_id)
      .maybeSingle();
    return (proj as { workspace_id?: string } | null)?.workspace_id ?? null;
  }
  return null;
}

// =============================================================================
// resolveWorkspaceIdFromDeal(dealId): Used by addPackageToProposal and upsertProposal
// =============================================================================

async function resolveWorkspaceIdFromDeal(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealId: string
): Promise<string | null> {
  const { data: deal } = await supabase
    .from('deals')
    .select('workspace_id')
    .eq('id', dealId)
    .maybeSingle();
  return deal && (deal as { workspace_id?: string }).workspace_id
    ? (deal as { workspace_id: string }).workspace_id
    : null;
}

/** Build a definition_snapshot JSONB object from line item data. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function buildSnapshot(item: any): Record<string, unknown> | null {
  const snap: Record<string, unknown> = {};
  if (item.category) snap.margin_meta = { category: item.category };
  if (item.requiredRoles?.length) snap.crew_meta = { required_roles: item.requiredRoles };
  if (item.floorPrice != null) snap.price_meta = { floor_price: item.floorPrice };
  if (item.isTaxable != null) snap.tax_meta = { is_taxable: item.isTaxable };
  const scheduleMeta: Record<string, unknown> = {};
  if (item.timeStart) scheduleMeta.time_start = item.timeStart;
  if (item.timeEnd) scheduleMeta.time_end = item.timeEnd;
  if (item.performanceSetCount != null) scheduleMeta.performance_set_count = item.performanceSetCount;
  if (item.performanceDurationMinutes != null) scheduleMeta.performance_duration_minutes = item.performanceDurationMinutes;
  if (Object.keys(scheduleMeta).length > 0) snap.schedule_meta = scheduleMeta;
  return Object.keys(snap).length > 0 ? snap : null;
}

// =============================================================================
// getExpandedPackageLineItems(packageId): Deep copy — items inside package (for preview + apply)
// =============================================================================

export interface ExpandedLineItem {
  name: string;
  description: string | null;
  quantity: number;
  unitPrice: number;
  unitType: UnitType;
  unitMultiplier: number;
  category: ProposalLineItemCategory | null;
  originPackageId: string | null;
  actualCost: number | null;
  requiredRoles: RequiredRole[] | null;
  floorPrice: number | null;
  isTaxable: boolean;
  performanceSetCount?: number | null;
  performanceDurationMinutes?: number | null;
}

export async function getExpandedPackageLineItems(
  packageId: string
): Promise<{ items: ExpandedLineItem[]; error?: string }> {
  const supabase = await createClient();
  const { data: pkg, error: pkgError } = await supabase
    .from('packages')
    .select('*')
    .eq('id', packageId)
    .single();
  if (pkgError || !pkg) {
    return { items: [], error: pkgError?.message ?? 'Package not found.' };
  }
  const def = pkg.definition as { blocks?: DefinitionBlock[] } | null;
  const blocks = def?.blocks ?? [];
  const catalogIds: { id: string; qty: number }[] = [];
  for (const b of blocks) {
    if (b.type === 'line_item' && 'catalogId' in b && 'quantity' in b) {
      const q = Number((b as { quantity: number }).quantity) || 1;
      catalogIds.push({ id: (b as { catalogId: string }).catalogId, qty: q });
    } else if (b.type === 'line_item_group' && 'items' in b) {
      const items = (b as { items: string[] }).items ?? [];
      for (const id of items) {
        if (id) catalogIds.push({ id, qty: 1 });
      }
    }
  }
  const pkgRow = pkg as { unit_type?: string; unit_multiplier?: number };
  const defaultUnitType = (pkgRow.unit_type === 'hour' || pkgRow.unit_type === 'day' ? pkgRow.unit_type : 'flat') as UnitType;
  const defaultUnitMultiplier = Number(pkgRow.unit_multiplier) > 0 ? Number(pkgRow.unit_multiplier) : 1;

  if (catalogIds.length === 0) {
    const cat = (pkg.category as string) as ProposalLineItemCategory;
    const roles = resolveRequiredRoles(def as PackageDefinition | null);
    const ingredientMeta = (def as PackageDefinition | null)?.ingredient_meta;
    return {
      items: [
        {
          name: pkg.name,
          description: pkg.description ?? null,
          quantity: 1,
          unitPrice: Number(pkg.price),
          unitType: defaultUnitType,
          unitMultiplier: defaultUnitMultiplier,
          category: cat ?? null,
          originPackageId: pkg.id,
          actualCost: pkg.target_cost != null ? Number(pkg.target_cost) : null,
          requiredRoles: roles.length > 0 ? roles : null,
          floorPrice: (pkg as { floor_price?: number }).floor_price != null ? Number((pkg as { floor_price?: number }).floor_price) : null,
          isTaxable: (pkg as { is_taxable?: boolean }).is_taxable !== false,
          performanceSetCount: ingredientMeta?.performance_set_count ?? null,
          performanceDurationMinutes: ingredientMeta?.performance_duration_minutes ?? null,
        },
      ],
    };
  }
  const ids = [...new Set(catalogIds.map((c) => c.id))];
  const { data: catalogPackages, error: catError } = await supabase
    .from('packages')
    .select('id, name, description, price, category, target_cost, unit_type, unit_multiplier, definition, floor_price, is_taxable')
    .in('id', ids);
  if (catError || !catalogPackages?.length) {
    return { items: [], error: catError?.message ?? 'Could not load package ingredients.' };
  }
  type CatalogRow = { id: string; name: string; description: string | null; price: number; category: string; target_cost: number | null; unit_type?: string; unit_multiplier?: number; definition?: unknown; floor_price?: number | null; is_taxable?: boolean };
  const byId = new Map((catalogPackages as CatalogRow[]).map((r) => [r.id, r]));
  const items: ExpandedLineItem[] = [];
  for (const { id, qty } of catalogIds) {
    const ref = byId.get(id);
    if (!ref) continue;
    const cat = (ref.category as string) as ProposalLineItemCategory;
    const ut = (ref.unit_type === 'hour' || ref.unit_type === 'day' ? ref.unit_type : 'flat') as UnitType;
    const um = Number(ref.unit_multiplier) > 0 ? Number(ref.unit_multiplier) : 1;
    const ingredientRoles = resolveRequiredRoles(ref.definition as PackageDefinition | null);
    const refMeta = (ref.definition as PackageDefinition | null)?.ingredient_meta;
    items.push({
      name: ref.name,
      description: ref.description ?? null,
      quantity: qty,
      unitPrice: Number(ref.price),
      unitType: ut,
      unitMultiplier: um,
      category: cat ?? null,
      originPackageId: ref.id,
      actualCost: ref.target_cost != null ? Number(ref.target_cost) : null,
      requiredRoles: ingredientRoles.length > 0 ? ingredientRoles : null,
      floorPrice: ref.floor_price != null ? Number(ref.floor_price) : null,
      isTaxable: ref.is_taxable !== false,
      performanceSetCount: refMeta?.performance_set_count ?? null,
      performanceDurationMinutes: refMeta?.performance_duration_minutes ?? null,
    });
  }
  return { items };
}

// =============================================================================
// addPackageToProposal(eventId, packageId): Append expanded package items to draft (deep copy)
// =============================================================================

export interface AddPackageToProposalResult {
  success: boolean;
  error?: string;
}

export async function addPackageToProposal(
  dealId: string,
  packageId: string,
  /** When provided, insert new rows immediately AFTER this sort_order. Existing
   *  rows with sort_order > insertAfterSortOrder are shifted down by the number
   *  of rows being inserted. When null/undefined, rows are appended to the end. */
  insertAfterSortOrder?: number | null
): Promise<AddPackageToProposalResult> {
  const supabase = await createClient();
  const workspaceId = await resolveWorkspaceIdFromDeal(supabase, dealId);
  if (!workspaceId) {
    return { success: false, error: 'Deal not found or workspace could not be resolved.' };
  }
  const { data: pkgRow } = await supabase
    .from('packages')
    .select('name, price, floor_price, is_taxable, target_cost, definition')
    .eq('id', packageId)
    .maybeSingle();
  const pkg = pkgRow as { name?: string; price?: number; floor_price?: number | null; is_taxable?: boolean | null; target_cost?: number | null; definition?: unknown } | null;
  const pkgDef = pkg?.definition as PackageDefinition | null;
  const displayGroupName = pkg?.name ?? null;
  const bundlePrice = pkg?.price != null && Number.isFinite(Number(pkg.price)) ? Number(pkg.price) : 0;

  const { items: expanded, error: expandError } = await getExpandedPackageLineItems(packageId);
  if (expandError || expanded.length === 0) {
    return { success: false, error: expandError ?? 'Package has no items to add.' };
  }

  const packageInstanceId = crypto.randomUUID();

  const { data: existing } = await supabase
    .from('proposals')
    .select('id')
    .eq('deal_id', dealId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let proposalId: string;
  let nextSortOrder: number;

  if (existing?.id) {
    proposalId = existing.id;
    if (insertAfterSortOrder != null) {
      // Insert in the middle: shift all rows with sort_order > insertAfterSortOrder
      // down by the number of rows we're about to add, then insert at the gap.
      const rowsCount = expanded.length === 1 ? 1 : 1 + expanded.length;
      const { data: toShift } = await supabase
        .from('proposal_items')
        .select('id, sort_order')
        .eq('proposal_id', proposalId)
        .gt('sort_order', insertAfterSortOrder)
        .order('sort_order', { ascending: false });
      if (toShift && toShift.length > 0) {
        // Update in reverse order so temporary collisions can't violate any future
        // UNIQUE(proposal_id, sort_order) constraint (none today, but future-proof).
        for (const row of toShift as { id: string; sort_order: number }[]) {
          await supabase
            .from('proposal_items')
            .update({ sort_order: row.sort_order + rowsCount })
            .eq('id', row.id);
        }
      }
      nextSortOrder = insertAfterSortOrder + 1;
    } else {
      const { data: maxRow } = await supabase
        .from('proposal_items')
        .select('sort_order')
        .eq('proposal_id', proposalId)
        .order('sort_order', { ascending: false })
        .limit(1)
        .maybeSingle();
      nextSortOrder = (maxRow && typeof (maxRow as { sort_order: number }).sort_order === 'number'
        ? (maxRow as { sort_order: number }).sort_order + 1
        : 0);
    }
  } else {
    const publicToken = crypto.randomUUID();
    const { data: inserted, error: insertError } = await supabase
      .from('proposals')
      .insert({
        workspace_id: workspaceId,
        deal_id: dealId,
        status: 'draft',
        public_token: publicToken,
      })
      .select('id')
      .single();
    if (insertError || !inserted?.id) {
      return { success: false, error: insertError?.message ?? 'Failed to create proposal.' };
    }
    proposalId = inserted.id;
    nextSortOrder = 0;
  }

  // Single-item packages: skip the header+child structure — just add a flat line item at bundle price.
  // Multi-item packages: insert a bundle header row then children at $0 (Tagged Bursting pattern).
  let rowsToInsert: object[];
  if (expanded.length === 1) {
    const item = expanded[0];
    rowsToInsert = [{
      proposal_id: proposalId,
      package_id: null as string | null,
      origin_package_id: packageId,
      package_instance_id: packageInstanceId,
      display_group_name: null,
      is_client_visible: true,
      is_package_header: false,
      original_base_price: item.unitPrice,
      unit_type: item.unitType ?? 'flat',
      unit_multiplier: item.unitMultiplier ?? 1,
      name: displayGroupName ?? item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unitPrice,
      override_price: null,
      actual_cost: item.actualCost,
      time_start: null,
      time_end: null,
      show_times_on_proposal: true,
      definition_snapshot: buildSnapshot(item),
      sort_order: nextSortOrder,
    }];
  } else {
    const headerRow = {
      proposal_id: proposalId,
      package_id: null as string | null,
      origin_package_id: packageId,
      package_instance_id: packageInstanceId,
      display_group_name: displayGroupName,
      is_client_visible: true,
      is_package_header: true,
      original_base_price: null as number | null,
      unit_type: 'flat' as const,
      unit_multiplier: 1,
      name: displayGroupName ?? 'Package',
      description: null as string | null,
      quantity: 1,
      unit_price: bundlePrice,
      override_price: null,
      actual_cost: pkg?.target_cost != null && Number.isFinite(Number(pkg.target_cost)) ? Number(pkg.target_cost) : null,
      time_start: null as string | null,
      time_end: null as string | null,
      show_times_on_proposal: true,
      definition_snapshot: buildSnapshot({
        category: 'package',
        requiredRoles: resolveRequiredRoles(pkgDef as PackageDefinition | null),
        floorPrice: pkg?.floor_price != null ? Number(pkg.floor_price) : null,
        isTaxable: pkg?.is_taxable !== false,
      }),
      sort_order: nextSortOrder,
    };
    const childRows = expanded.map((item, i) => ({
      proposal_id: proposalId,
      package_id: null as string | null,
      origin_package_id: item.originPackageId,
      package_instance_id: packageInstanceId,
      display_group_name: displayGroupName,
      is_client_visible: true,
      is_package_header: false,
      original_base_price: item.unitPrice,
      unit_type: item.unitType ?? 'flat',
      unit_multiplier: item.unitMultiplier ?? 1,
      name: item.name,
      description: item.description,
      quantity: item.quantity,
      unit_price: 0,
      override_price: null,
      actual_cost: item.actualCost,
      time_start: null as string | null,
      time_end: null as string | null,
      show_times_on_proposal: true,
      definition_snapshot: buildSnapshot(item),
      sort_order: nextSortOrder + 1 + i,
    }));
    rowsToInsert = [headerRow, ...childRows];
  }
  const { error: itemsError } = await supabase.from('proposal_items').insert(rowsToInsert);
  if (itemsError) {
    return { success: false, error: itemsError.message };
  }
  return { success: true };
}

// =============================================================================
// getPackages(workspaceId): Fetch all active packages for a workspace
// =============================================================================

export async function getPackages(workspaceId: string): Promise<GetPackagesResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .eq('is_active', true)
    .order('name', { ascending: true });

  if (error) {
    return { packages: [], error: error.message };
  }

  return { packages: (data ?? []) as Package[] };
}

/** Fetch all packages for Catalog page (active + archived). */
export async function getCatalogPackages(workspaceId: string): Promise<GetPackagesResult> {
  const supabase = await createClient();

  const { data, error } = await supabase
    .from('packages')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('is_active', { ascending: false })
    .order('name', { ascending: true });

  if (error) {
    return { packages: [], error: error.message };
  }

  return { packages: (data ?? []) as Package[] };
}

// =============================================================================
// deleteProposalItemsByPackageInstanceId(proposalId, packageInstanceId): Remove entire burst group
// =============================================================================

export async function deleteProposalItemsByPackageInstanceId(
  proposalId: string,
  packageInstanceId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error } = await supabase
    .from('proposal_items')
    .delete()
    .eq('proposal_id', proposalId)
    .eq('package_instance_id', packageInstanceId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// =============================================================================
// unpackPackageInstance(proposalId, packageInstanceId): Break package into a la carte line items
// =============================================================================

export async function unpackPackageInstance(
  proposalId: string,
  packageInstanceId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { error: deleteError } = await supabase
    .from('proposal_items')
    .delete()
    .eq('proposal_id', proposalId)
    .eq('package_instance_id', packageInstanceId)
    .eq('is_package_header', true);
  if (deleteError) return { success: false, error: deleteError.message };

  const { data: children } = await supabase
    .from('proposal_items')
    .select('id, original_base_price')
    .eq('proposal_id', proposalId)
    .eq('package_instance_id', packageInstanceId);
  if (children?.length) {
    for (const row of children as { id: string; original_base_price: number | null }[]) {
      const { error: updateError } = await supabase
        .from('proposal_items')
        .update({
          unit_price: row.original_base_price ?? 0,
          package_instance_id: null,
          display_group_name: null,
        })
        .eq('id', row.id);
      if (updateError) return { success: false, error: updateError.message };
    }
  }
  return { success: true };
}

// =============================================================================
// upsertProposal(dealId, items): Create or update draft proposal and line items (Liquid phase)
// =============================================================================

export async function upsertProposal(
  dealId: string,
  items: ProposalLineItemInput[]
): Promise<UpsertProposalResult> {
  const supabase = await createClient();
  const workspaceId = await resolveWorkspaceIdFromDeal(supabase, dealId);
  if (!workspaceId) {
    return { proposalId: null, total: 0, error: 'Deal not found or workspace could not be resolved.' };
  }

  // 2. Find existing draft proposal for this deal, or create one
  const { data: existing } = await supabase
    .from('proposals')
    .select('id')
    .eq('deal_id', dealId)
    .eq('status', 'draft')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  let proposalId: string;

  if (existing?.id) {
    proposalId = existing.id;
    await supabase.from('proposal_items').delete().eq('proposal_id', proposalId);
  } else {
    // Inherit workspace payment defaults for new proposals
    const { data: wsDefaults } = await supabase
      .from('workspaces')
      .select('default_deposit_percent, default_deposit_deadline_days, default_balance_due_days_before_event')
      .eq('id', workspaceId)
      .maybeSingle();

    const wsd = wsDefaults as {
      default_deposit_percent?: number | null;
      default_deposit_deadline_days?: number | null;
      default_balance_due_days_before_event?: number | null;
    } | null;

    const publicToken = crypto.randomUUID();
    const { data: inserted, error: insertError } = await supabase
      .from('proposals')
      .insert({
        workspace_id: workspaceId,
        deal_id: dealId,
        status: 'draft',
        public_token: publicToken,
        deposit_percent: wsd?.default_deposit_percent ?? 50,
        deposit_deadline_days: wsd?.default_deposit_deadline_days ?? 7,
        payment_due_days: wsd?.default_balance_due_days_before_event ?? 14,
      })
      .select('id')
      .single();

    if (insertError || !inserted?.id) {
      return { proposalId: null, total: 0, error: insertError?.message ?? 'Failed to create proposal' };
    }
    proposalId = inserted.id;
  }

  // 3. Insert proposal_items (snapshot on insert: no live link; origin_package_id for analytics only)
  let total = 0;
  if (items.length > 0) {
    const originId = (item: ProposalLineItemInput) =>
      item.originPackageId ?? item.packageId ?? null;
    const multiplier = (item: ProposalLineItemInput) =>
      (item.unitType === 'hour' || item.unitType === 'day')
        ? Math.max(0, Number(item.unitMultiplier) || 1)
        : 1;
    const rows = items.map((item, index) => ({
      proposal_id: proposalId,
      package_id: null as string | null,
      origin_package_id: originId(item),
      package_instance_id: item.packageInstanceId ?? null,
      display_group_name: item.displayGroupName ?? null,
      is_client_visible: item.isClientVisible ?? true,
      is_package_header: item.isPackageHeader ?? false,
      original_base_price: item.originalBasePrice != null && Number.isFinite(Number(item.originalBasePrice)) ? Number(item.originalBasePrice) : null,
      unit_type: (item.unitType === 'hour' || item.unitType === 'day' ? item.unitType : 'flat') as string,
      unit_multiplier: Math.max(0, Number(item.unitMultiplier) || 1),
      name: item.name,
      description: item.description ?? null,
      quantity: item.quantity,
      unit_price: String(item.unitPrice),
      override_price: item.overridePrice != null && Number.isFinite(Number(item.overridePrice)) ? Number(item.overridePrice) : null,
      actual_cost: item.actualCost != null && Number.isFinite(Number(item.actualCost)) ? Number(item.actualCost) : null,
      internal_notes: item.internalNotes ?? null,
      is_optional: item.isOptional ?? false,
      time_start: item.timeStart ?? null,
      time_end: item.timeEnd ?? null,
      show_times_on_proposal: item.showTimesOnProposal ?? true,
      definition_snapshot: buildSnapshot(item),
      sort_order: index,
    }));

    const { error: itemsError } = await supabase.from('proposal_items').insert(rows);

    if (itemsError) {
      return { proposalId: null, total: 0, error: itemsError.message };
    }

    const effectivePrice = (item: ProposalLineItemInput) =>
      item.overridePrice != null && Number.isFinite(Number(item.overridePrice))
        ? Number(item.overridePrice)
        : item.unitPrice;
    total = items.reduce(
      (sum, item) => sum + item.quantity * multiplier(item) * effectivePrice(item),
      0
    );
  }

  // Fire-and-forget: embed proposal content for Aion RAG
  if (items.length > 0) {
    const proposalText = items
      .map((i) => `${i.name}${i.description ? ': ' + i.description : ''} (qty ${i.quantity}, $${i.unitPrice})`)
      .join('\n');
    const { data: dealRow } = await supabase.from('deals').select('title').eq('id', dealId).maybeSingle();
    const header = buildContextHeader('proposal', { dealTitle: (dealRow as any)?.title });
    // Sprint 0 removed the throw semantics from upsertEmbedding — the old
    // .catch() never fires now. observeUpsert inspects the returned
    // UpsertOutcome and logs/Sentries failures (S0-1 fix).
    observeUpsert(
      upsertEmbedding(workspaceId, 'proposal', proposalId, proposalText, header),
      { sourceType: 'proposal', sourceId: proposalId },
    );
  }

  return { proposalId, total };
}


// =============================================================================
// updateProposalItem — patch a proposal line item's editable fields.
// Caller picks which fields to update. Price edits write to `override_price`
// (not `unit_price`) so the catalog snapshot stays intact and calculateProposal
// Total keeps using override_price ?? unit_price. Setting override_price to
// null reverts to the catalog default.
// =============================================================================

export type ProposalItemPatch = {
  quantity?: number;
  override_price?: number | null;
  internal_notes?: string | null;
  actual_cost?: number | null;
  /** Hours or days for unit_type='hour' / 'day' items. Scales revenue AND
   *  cost (see calculate-proposal-total.ts). No effect on 'flat' items. */
  unit_multiplier?: number | null;
  /** When true, the client sees a checkbox on this line and can opt in or
   *  out. Unchecked items are struck through and excluded from the total
   *  via calculateProposalTotal's `clientSelected` gate. */
  is_optional?: boolean;
  /** When false, the row is filtered out of the client-facing proposal by
   *  get-public-proposal.ts. Still visible + editable to the PM and still
   *  counted in internal margin/cost math. */
  is_client_visible?: boolean;
};

export async function updateProposalItem(
  itemId: string,
  patch: ProposalItemPatch,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!itemId) return { success: false, error: 'Missing item id' };
  const allowedKeys: Array<keyof ProposalItemPatch> = [
    'quantity',
    'override_price',
    'internal_notes',
    'actual_cost',
    'unit_multiplier',
    'is_optional',
    'is_client_visible',
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in patch) update[key] = patch[key];
  }
  if (Object.keys(update).length === 0) return { success: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from('proposal_items')
    .update(update)
    .eq('id', itemId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// =============================================================================
// deleteProposalItem — remove a single line item. For bundle rows, callers
// should use deleteProposalItemsByPackageInstanceId to cascade the whole
// bundle; this helper only removes the one row it's pointed at.
// =============================================================================

export async function deleteProposalItem(
  itemId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!itemId) return { success: false, error: 'Missing item id' };
  const supabase = await createClient();
  const { error } = await supabase
    .from('proposal_items')
    .delete()
    .eq('id', itemId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

// =============================================================================
// updateProposal — patch a proposal's editable top-level fields.
// Mirrors updateProposalItem: caller picks which keys to change, server
// enforces the allowlist. Used by the FinancialInspector to edit payment
// terms and scope notes inline.
// =============================================================================

export type ProposalPatch = {
  deposit_percent?: number | null;
  payment_due_days?: number | null;
  payment_notes?: string | null;
  scope_notes?: string | null;
  deposit_deadline_days?: number | null;
};

export async function updateProposal(
  proposalId: string,
  patch: ProposalPatch,
): Promise<{ success: true } | { success: false; error: string }> {
  if (!proposalId) return { success: false, error: 'Missing proposal id' };
  const allowedKeys: Array<keyof ProposalPatch> = [
    'deposit_percent',
    'payment_due_days',
    'payment_notes',
    'scope_notes',
    'deposit_deadline_days',
  ];
  const update: Record<string, unknown> = {};
  for (const key of allowedKeys) {
    if (key in patch) update[key] = patch[key];
  }
  if (Object.keys(update).length === 0) return { success: true };

  const supabase = await createClient();
  const { error } = await supabase
    .from('proposals')
    .update(update)
    .eq('id', proposalId);
  if (error) return { success: false, error: error.message };
  return { success: true };
}
