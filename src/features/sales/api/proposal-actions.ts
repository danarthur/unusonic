 
/**
 * Sales feature – Server Actions: packages, upsert proposal, publish proposal
 * @module features/sales/api/proposal-actions
 */

'use server';

import { unstable_noStore } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { sendProposalLinkEmail } from '@/shared/api/email/send';
import type { SendProposalLinkSenderOptions } from '@/shared/api/email/send';
import { createDocuSealSubmission } from './create-docuseal-submission';
import { getPublicProposal } from './get-public-proposal';
import type { Package } from '@/types/supabase';
import type { ProposalWithItems } from '../model/types';
import { resolveRequiredRoles, type RequiredRole, type PackageDefinition } from './package-types';
import { upsertEmbedding, buildContextHeader } from '@/app/api/aion/lib/embeddings';

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

export interface PublishProposalResult {
  publicToken: string | null;
  publicUrl: string | null;
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
  packageId: string
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
    upsertEmbedding(workspaceId, 'proposal', proposalId, proposalText, header).catch((err: unknown) => {
      Sentry.captureMessage('upsertProposal: embedding failed', {
        level: 'warning',
        extra: {
          workspaceId,
          proposalId,
          dealId,
          error: err instanceof Error ? err.message : String(err),
        },
        tags: { area: 'sales.embeddings' },
      });
    });
  }

  return { proposalId, total };
}

// =============================================================================
// publishProposal(proposalId): Set status to 'sent', return public_token URL
// Uses service-role so RLS cannot block (user already proved access via upsert).
// =============================================================================

export async function publishProposal(proposalId: string): Promise<PublishProposalResult> {
  const supabase = getSystemClient();
  const now = new Date().toISOString();
  const publicToken = crypto.randomUUID();

  const { data, error } = await supabase
    .from('proposals')
    .update({
      status: 'sent',
      updated_at: now,
      public_token: publicToken,
    })
    .eq('id', proposalId)
    .eq('status', 'draft')
    .select('public_token')
    .single();

  if (error) {
    return {
      publicToken: null,
      publicUrl: null,
      error: error?.message ?? 'Proposal not found or not draft',
    };
  }

  const token = (data?.public_token as string) ?? publicToken;
  const baseUrl = getPublicBaseUrl();
  const publicUrl = baseUrl ? `${baseUrl}/p/${token}` : `/p/${token}`;

  return { publicToken: token, publicUrl };
}

// =============================================================================
// sendProposalLinkToRecipients(publicUrl, recipientEmails, dealTitle?)
// Reply-To pattern (no Gmail/OAuth): sends via Resend; reply_to is set to the current user's
// email (auth.getUser()) so replies go to their inbox. Uses Resend only; if RESEND_API_KEY
// is not set, returns { sent: 0, failed: N, notConfigured: true }.
// =============================================================================

export type SendProposalLinkResult = {
  sent: number;
  failed: number;
  notConfigured?: boolean;
  firstError?: string;
};

export async function sendProposalLinkToRecipients(
  publicUrl: string,
  recipientEmails: string[],
  dealTitle?: string | null
): Promise<SendProposalLinkResult> {
  const normalized = [...new Set(recipientEmails.map((e) => e.trim().toLowerCase()).filter(Boolean))];
  if (normalized.length === 0) return { sent: 0, failed: 0 };

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).maybeSingle()
    : { data: null };
  const senderName =
    (profile as { full_name?: string | null } | null)?.full_name?.trim() ||
    (user?.user_metadata?.full_name as string | undefined)?.trim() ||
    null;
  const senderReplyTo = user?.email?.trim() || null;
  const senderOptions =
    senderName || senderReplyTo
      ? { senderName: senderName ?? undefined, senderReplyTo: senderReplyTo ?? undefined }
      : undefined;

  let sent = 0;
  let failed = 0;
  let firstError: string | undefined;
  for (const to of normalized) {
    const result = await sendProposalLinkEmail(to, publicUrl, dealTitle, senderOptions);
    if (result.ok) sent++;
    else {
      failed++;
      if (!firstError) firstError = result.error;
    }
  }
  const notConfigured = sent === 0 && failed > 0 && firstError?.includes('not configured');
  return { sent, failed, ...(firstError ? { firstError } : {}), ...(notConfigured ? { notConfigured: true } : {}) };
}

// =============================================================================
// signProposal — REMOVED 2026-04-12 (Wave 3 V5 deletion).
// Reason: non-DocuSeal sign path was a pre-launch orphan that bypassed
// finance.spawn_invoices_from_proposal — clients signed but no invoices spawned.
// DocuSeal webhook (/api/docuseal-webhook) is now the canonical sign path per
// billing rebuild commit 5edf5ff. SignProposalDialog and AcceptanceBar deleted.
// Workspaces without DocuSeal show a "not yet enabled" notice in PublicProposalView.
// =============================================================================

// =============================================================================
// revertProposalToDraft(proposalId): Set status back to 'draft' (testing/admin)
// Uses server client so RLS enforces workspace access. Use to unlock a signed
// proposal for editing (e.g. test events). Contract remains signed; this only
// unlocks the proposal builder.
// =============================================================================

export type RevertProposalResult = { success: true } | { success: false; error: string };

export async function revertProposalToDraft(proposalId: string): Promise<RevertProposalResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from('proposals')
    .update({
      status: 'draft',
      updated_at: new Date().toISOString(),
    })
    .eq('id', proposalId)
    .eq('status', 'accepted')
    .select('id')
    .single();

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Proposal not found or not accepted.' };
  }
  return { success: true };
}

// =============================================================================
// sendForSignature(dealId, clientEmail, clientName): Publish + DocuSeal e-sign
// Publishes the draft proposal (sets public_token + status='sent'), then creates
// a DocuSeal submission for e-signature. Stores docuseal_submission_id on the
// proposal row. Falls back gracefully if DocuSeal is not configured.
// =============================================================================

export type SendForSignatureResult =
  | { success: true; publicUrl: string }
  | { success: false; error: string };

export async function sendForSignature(
  dealId: string,
  clientEmail: string,
  clientName: string
): Promise<SendForSignatureResult> {
  const supabase = await createClient();

  // 0. Verify caller owns the deal (defence-in-depth over RLS alone)
  const workspaceMembership = await getActiveWorkspaceId();
  if (!workspaceMembership) {
    return { success: false, error: 'No active workspace.' };
  }

  // 1. Resolve the draft proposal ID for this deal — include workspace_id for ownership check
  const { data: draftRow } = await supabase
    .from('proposals')
    .select('id, workspace_id')
    .eq('deal_id', dealId)
    .eq('status', 'draft')
    .eq('workspace_id', workspaceMembership)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!draftRow?.id) {
    return { success: false, error: 'No draft proposal found for this deal.' };
  }

  const draftProposalId = draftRow.id;

  // 2. Publish the proposal (sets public_token, status → 'sent')
  const publishResult = await publishProposal(draftProposalId);
  if (!publishResult.publicToken || !publishResult.publicUrl) {
    return { success: false, error: publishResult.error ?? 'Failed to publish proposal.' };
  }

  const { publicToken, publicUrl } = publishResult;

  // 2b. Advance deal status to 'contract_sent' — only if it hasn't already passed that stage
  await supabase
    .from('deals')
    .update({ status: 'contract_sent' })
    .eq('id', dealId)
    .eq('workspace_id', workspaceMembership)
    .in('status', ['inquiry', 'proposal']);

  // 3. Fetch deal title + workspace name for branding
  const { data: dealRow } = await supabase
    .from('deals')
    .select('title, workspace_id, event_archetype, organization_id')
    .eq('id', dealId)
    .maybeSingle();
  const deal = dealRow as { title?: string | null; workspace_id?: string | null; event_archetype?: string | null; organization_id?: string | null } | null;
  const eventTitle = deal?.title ?? 'Proposal';
  const workspaceId = deal?.workspace_id ?? '';

  // Resolve sender name (display name from directory) + workspace name for branding
  const { data: { user } } = await supabase.auth.getUser();
  const senderEmail = user?.email ?? null;
  const [senderEntRes, workspaceRes] = await Promise.all([
    user?.id
      ? supabase.schema('directory').from('entities')
          .select('display_name')
          .eq('claimed_by_user_id', user.id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
    supabase.from('workspaces').select('name').eq('id', workspaceId).maybeSingle(),
  ]);
  const senderName = (senderEntRes.data as { display_name?: string | null } | null)?.display_name ?? null;
  const workspaceName = (workspaceRes.data as { name?: string | null } | null)?.name ?? null;

  // Look up client entity type for couple-aware subject line logic
  const entityTypeRes = deal?.organization_id
    ? await supabase
        .schema('directory')
        .from('entities')
        .select('type')
        .eq('id', deal.organization_id)
        .maybeSingle()
    : null;
  const rawEntityType = (entityTypeRes?.data as { type?: string | null } | null)?.type ?? null;
  const SUBJECT_ENTITY_TYPES = ['person', 'company', 'venue', 'couple'] as const;
  type SubjectEntityType = typeof SUBJECT_ENTITY_TYPES[number];
  const entityType: SubjectEntityType | null =
    rawEntityType && (SUBJECT_ENTITY_TYPES as readonly string[]).includes(rawEntityType)
      ? (rawEntityType as SubjectEntityType)
      : null;

  const clientFirstName = clientName?.trim().split(/\s+/)[0] ?? null;

  // 4. Create DocuSeal submission
  const submission = await createDocuSealSubmission(
    draftProposalId,
    publicToken,
    clientEmail,
    clientName,
    eventTitle,
    workspaceId
  );

  // 4b. Fetch rich proposal data for email (event date, total, payment terms).
  // getPublicProposal was already called inside createDocuSealSubmission — we call it
  // again here so sendForSignature owns the data without coupling to DocuSeal internals.
  const proposalData = await getPublicProposal(publicToken);

  const senderOptions: SendProposalLinkSenderOptions = {
    senderName,
    senderReplyTo: senderEmail,
    workspaceName,
    workspaceId,
    clientFirstName,
    eventDate: proposalData?.event.startsAt ?? null,
    total: proposalData?.total ?? null,
    depositPercent: (proposalData?.proposal as { deposit_percent?: number | null } | undefined)?.deposit_percent ?? null,
    paymentDueDays: (proposalData?.proposal as { payment_due_days?: number | null } | undefined)?.payment_due_days ?? null,
    entityType,
    eventArchetype: deal?.event_archetype ?? null,
    eventStartTime: proposalData?.event.eventStartTime ?? null,
    eventEndTime: proposalData?.event.eventEndTime ?? null,
  };

  if (!submission.success) {
    // Non-fatal: DocuSeal not configured or returned an error — fall back to
    // sending a plain proposal link. Surface to Sentry so operators can see
    // when a workspace is losing the e-signature path; this was previously
    // a silent console.warn that hid DocuSeal outages.
    console.warn('[sendForSignature] DocuSeal step skipped:', submission.error);
    Sentry.captureMessage('sendForSignature: DocuSeal fallback to plain email', {
      level: 'warning',
      extra: {
        draftProposalId,
        workspaceId: workspaceMembership,
        dealId,
        reason: submission.error,
      },
      tags: { area: 'sales.docuseal' },
    });
    const fallbackResult = await sendProposalLinkEmail(clientEmail, publicUrl, eventTitle, senderOptions);
    if (fallbackResult.ok && fallbackResult.messageId) {
      const sys = getSystemClient();
      await sys
        .from('proposals')
        .update({ resend_message_id: fallbackResult.messageId })
        .eq('id', draftProposalId)
        .eq('workspace_id', workspaceMembership);
    }
    return { success: true, publicUrl };
  }

  // 5. Store docuseal_submission_id + embed_src
  const systemClient = getSystemClient();
  await systemClient
    .from('proposals')
    .update({
      docuseal_submission_id: submission.submissionId,
      docuseal_embed_src: submission.embedSrc,
    })
    .eq('id', draftProposalId)
    .eq('workspace_id', workspaceMembership);

  // 6. Send "Review and sign" email via Resend — publicUrl is the proposal page where signing happens
  const emailResult = await sendProposalLinkEmail(clientEmail, publicUrl, eventTitle, senderOptions);

  // Store Resend message ID for delivery/bounce webhook tracking
  if (emailResult.ok && emailResult.messageId) {
    await systemClient
      .from('proposals')
      .update({ resend_message_id: emailResult.messageId })
      .eq('id', draftProposalId)
      .eq('workspace_id', workspaceMembership);
  }

  // 7. Create immediate follow-up queue item so the PM sees it on the Deal tab right away
  try {
    const { createProposalSentFollowUp } = await import('@/app/(dashboard)/(features)/crm/actions/follow-up-actions');
    await createProposalSentFollowUp(dealId);
  } catch { /* non-fatal */ }

  return { success: true, publicUrl };
}

// =============================================================================
// sendProposalReminder(dealId): Send a follow-up reminder for an unsigned proposal
// =============================================================================

export async function sendProposalReminder(
  dealId: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = await createClient();

  // Auth — server client RLS scopes to user's workspace automatically
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Not authorised' };

  // Fetch deal with latest proposal
  const { data: dealRow } = await supabase
    .from('deals')
    .select('id, workspace_id, title, main_contact_id, event_archetype, proposals(id, status, public_token, created_at)')
    .eq('id', dealId)
    .maybeSingle();

  if (!dealRow) return { ok: false, error: 'Not authorised' };

  const deal = dealRow as {
    id: string;
    workspace_id: string | null;
    title: string | null;
    main_contact_id: string | null;
    event_archetype: string | null;
    proposals: { id: string; status: string; public_token: string | null; created_at: string }[];
  };

  // Find the most recent sent/viewed proposal. Sort descending so activeProposals[0]
  // is always the latest one (guards against multiple sent proposals from resends).
  const activeProposals = (deal.proposals ?? [])
    .filter((p) => p.status === 'sent' || p.status === 'viewed')
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  if (activeProposals.length === 0) {
    // Check if there's an already-accepted one
    const accepted = (deal.proposals ?? []).some((p) => p.status === 'accepted');
    if (accepted) return { ok: false, error: 'Proposal already signed' };
    return { ok: false, error: 'No active proposal to remind' };
  }

  const proposal = activeProposals[0];
  const publicToken = (proposal as { public_token?: string | null }).public_token;
  if (!publicToken) return { ok: false, error: 'Proposal has no public link' };

  const base = getPublicBaseUrl();
  const proposalUrl = base ? `${base}/p/${publicToken}` : `/p/${publicToken}`;

  // Resolve client email from main_contact_id → directory.entities.attributes
  let clientEmail: string | null = null;
  let clientFirstName: string | null = null;
  let clientEntityType: string | null = null;
  if (deal.main_contact_id) {
    const { data: entityRow } = await supabase
      .schema('directory')
      .from('entities')
      .select('type, attributes, display_name')
      .eq('id', deal.main_contact_id)
      .maybeSingle();
    if (entityRow) {
      const attrs = (entityRow as { attributes?: Record<string, unknown> | null }).attributes ?? {};
      const entityType = (entityRow as { type?: string }).type ?? 'person';
      clientEntityType = entityType;
      if (entityType === 'company') {
        clientEmail =
          (attrs['support_email'] as string | null) ??
          (attrs['email'] as string | null) ??
          null;
      } else if (entityType === 'couple') {
        // Couples store primary contact email under partner_a_email
        clientEmail =
          (attrs['partner_a_email'] as string | null) ??
          (attrs['email'] as string | null) ??
          null;
      } else {
        clientEmail = (attrs['email'] as string | null) ?? null;
      }
      // display_name is a proper column, not an attributes JSONB field — no ESLint violation
      const displayName = (entityRow as { display_name?: string | null }).display_name ?? null;
      clientFirstName = displayName?.split(' ')[0] ?? null;
    }
  }

  if (!clientEmail?.trim()) {
    return { ok: false, error: 'No email address on file for this client' };
  }

  // Stamp reminder_sent_at
  await supabase
    .from('proposals')
    .update({ reminder_sent_at: new Date().toISOString() })
    .eq('id', proposal.id);

  // Resolve sender name from directory entity (same source as sendForSignature)
  const { data: senderEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('display_name')
    .eq('claimed_by_user_id', user.id)
    .maybeSingle();
  const senderName = (senderEntity as { display_name?: string | null } | null)?.display_name ?? null;

  // Fetch rich proposal data for reminder enrichment (status is 'sent' or 'viewed' — both valid)
  const proposalData = publicToken
    ? await getPublicProposal(publicToken).catch((err: unknown) => {
        Sentry.captureMessage('sendProposalReminder: getPublicProposal failed', {
          level: 'warning',
          extra: {
            dealId,
            publicToken,
            error: err instanceof Error ? err.message : String(err),
          },
          tags: { area: 'sales.docuseal' },
        });
        return null;
      })
    : null;

  const { sendProposalReminderEmail } = await import('@/shared/api/email/send');
  const emailResult = await sendProposalReminderEmail({
    to: clientEmail.trim(),
    proposalUrl,
    eventTitle: deal.title ?? 'your event',
    workspaceId: deal.workspace_id ?? '',
    senderName,
    clientFirstName,
    eventDate: proposalData?.event?.startsAt ?? null,
    proposalTotal: proposalData?.total ?? null,
    entityType: clientEntityType,
    eventArchetype: deal.event_archetype ?? null,
  });

  if (!emailResult.ok) return { ok: false, error: emailResult.error };

  // Store Resend message ID for delivery/bounce webhook tracking
  if (emailResult.messageId) {
    await supabase
      .from('proposals')
      .update({ resend_message_id: emailResult.messageId } as Record<string, unknown>)
      .eq('id', proposal.id);
  }

  return { ok: true };
}
