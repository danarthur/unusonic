'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { planGearFromProposal } from './plan-gear-from-proposal';
import type {
  ProposalGearBundle,
  ProposalGearPlanItem,
  ProposalGearService,
  ProposalGearStandalone,
} from './plan-gear-from-proposal-types';

export type SyncGearFromProposalResult =
  | { success: true; added: number }
  | { success: false; error: string };

/**
 * Materializes a deal's proposal gear into ops.event_gear_items with full
 * lineage (Phase 2a of the proposal→gear lineage plan, §5).
 *
 * Idempotent by `proposal_item_id`: items already linked to the event are
 * skipped, so re-running this call after a PM has swapped or detached rows
 * preserves their work. Decomposed bundles insert as a parent row plus
 * children referencing it via `parent_gear_item_id`; whole-row bundles and
 * standalone rentals insert as single rows. Every inserted row carries
 * `lineage_source='proposal'` and a frozen `package_snapshot`.
 *
 * Today this is invoked once at handoff (handover-deal.ts). Phase 3 will
 * surface proposal-changed diffs as a separate notify-not-mirror flow.
 */

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type WriteContext = {
  supabase: SupabaseServerClient;
  eventId: string;
  workspaceId: string;
};

type SyncState = {
  linkedProposalItemIds: Set<string>;
  nextSort: number;
  added: number;
};

export async function syncGearFromProposalToEvent(eventId: string): Promise<SyncGearFromProposalResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  const dealId = await resolveDealId(supabase, eventId, workspaceId);
  if (!dealId.ok) return dealId;

  const plan = await planGearFromProposal(dealId.value);
  if (!plan || plan.items.length === 0) return { success: true, added: 0 };

  const state = await loadInitialState(supabase, eventId, workspaceId);
  const ctx: WriteContext = { supabase, eventId, workspaceId };

  for (const item of plan.items) {
    if (isPlanItemLinked(item, state.linkedProposalItemIds)) continue;
    await applyPlanItem(ctx, item, state);
  }

  return { success: true, added: state.added };
}

type Resolved<T> = { ok: true; value: T } | { ok: false; success: false; error: string };

async function resolveDealId(
  supabase: SupabaseServerClient,
  eventId: string,
  workspaceId: string,
): Promise<Resolved<string>> {
  const { data: event, error: eventErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, project:projects!inner(workspace_id)')
    .eq('id', eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();

  if (eventErr || !event) return { ok: false, success: false, error: 'Event not found.' };

  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!deal?.id) return { ok: false, success: false, error: 'No deal linked to this event.' };
  return { ok: true, value: deal.id };
}

async function loadInitialState(
  supabase: SupabaseServerClient,
  eventId: string,
  workspaceId: string,
): Promise<SyncState> {
  const { data: existing } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('proposal_item_id, sort_order')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId);

  const linked = new Set<string>();
  let maxSort = -1;
  for (const row of (existing ?? []) as { proposal_item_id: string | null; sort_order: number }[]) {
    if (row.proposal_item_id) linked.add(row.proposal_item_id);
    if (row.sort_order > maxSort) maxSort = row.sort_order;
  }
  return { linkedProposalItemIds: linked, nextSort: maxSort + 1, added: 0 };
}

function isPlanItemLinked(item: ProposalGearPlanItem, linked: Set<string>): boolean {
  if (item.kind === 'standalone') return linked.has(item.proposalItemId);
  if (item.kind === 'service') return linked.has(item.proposalItemId);
  return linked.has(item.headerProposalItemId);
}

async function applyPlanItem(
  ctx: WriteContext,
  item: ProposalGearPlanItem,
  state: SyncState,
): Promise<void> {
  if (item.kind === 'standalone') {
    const ok = await insertStandalone(ctx, item, state.nextSort);
    if (!ok) return;
    state.linkedProposalItemIds.add(item.proposalItemId);
    state.nextSort += 1;
    state.added += 1;
    return;
  }

  if (item.kind === 'service') {
    const ok = await insertServiceParent(ctx, item, state.nextSort);
    if (!ok) return;
    state.linkedProposalItemIds.add(item.proposalItemId);
    state.nextSort += 1;
    state.added += 1;
    return;
  }

  const result = await insertBundle(ctx, item, state.nextSort);
  if (!result) return;
  state.linkedProposalItemIds.add(item.headerProposalItemId);
  for (const childId of result.linkedChildIds) state.linkedProposalItemIds.add(childId);
  state.nextSort += result.rowsInserted;
  state.added += result.rowsInserted;
}

async function insertStandalone(
  ctx: WriteContext,
  item: ProposalGearStandalone,
  sortOrder: number,
): Promise<boolean> {
  const { error } = await ctx.supabase
    .schema('ops')
    .from('event_gear_items')
    .insert({
      event_id: ctx.eventId,
      workspace_id: ctx.workspaceId,
      name: item.name,
      quantity: item.quantity,
      status: 'allocated',
      catalog_package_id: item.catalogPackageId,
      is_sub_rental: item.isSubRental,
      department: item.department,
      sort_order: sortOrder,
      lineage_source: 'proposal',
      proposal_item_id: item.proposalItemId,
      is_package_parent: false,
    });
  if (error) {
    console.error('[CRM] syncGearFromProposalToEvent (standalone):', error.message);
    return false;
  }
  return true;
}

/**
 * Service parent (Phase 2e). Lands as a top-level parent gear row with no
 * children — kit children are materialized later by the PM via
 * materializeKitFromCrew. The service stays connected to its bundle via
 * `package_instance_id` even though it sits at the top level visually.
 */
async function insertServiceParent(
  ctx: WriteContext,
  item: ProposalGearService,
  sortOrder: number,
): Promise<boolean> {
  const { error } = await ctx.supabase
    .schema('ops')
    .from('event_gear_items')
    .insert({
      event_id: ctx.eventId,
      workspace_id: ctx.workspaceId,
      name: item.serviceName,
      quantity: item.quantity,
      status: 'allocated',
      catalog_package_id: item.catalogPackageId,
      is_sub_rental: false,
      department: null,
      sort_order: sortOrder,
      lineage_source: 'proposal',
      proposal_item_id: item.proposalItemId,
      package_instance_id: item.packageInstanceId,
      package_snapshot: item.packageSnapshot,
      is_package_parent: true,
    });
  if (error) {
    console.error('[CRM] syncGearFromProposalToEvent (service parent):', error.message);
    return false;
  }
  return true;
}

type BundleInsertResult = { rowsInserted: number; linkedChildIds: string[] };

async function insertBundle(
  ctx: WriteContext,
  bundle: ProposalGearBundle,
  startingSort: number,
): Promise<BundleInsertResult | null> {
  if (!bundle.decomposed) {
    return insertWholeBundle(ctx, bundle, startingSort);
  }

  const parentId = await insertBundleParent(ctx, bundle, startingSort);
  if (!parentId) return null;

  if (bundle.children.length === 0) {
    return { rowsInserted: 1, linkedChildIds: [] };
  }

  const childrenOk = await insertBundleChildren(ctx, bundle, parentId, startingSort + 1);
  if (!childrenOk) {
    await ctx.supabase.schema('ops').from('event_gear_items').delete().eq('id', parentId);
    return null;
  }

  return {
    rowsInserted: 1 + bundle.children.length,
    linkedChildIds: bundle.children.map((c) => c.proposalItemId),
  };
}

async function insertWholeBundle(
  ctx: WriteContext,
  bundle: ProposalGearBundle,
  sortOrder: number,
): Promise<BundleInsertResult | null> {
  const { error } = await ctx.supabase
    .schema('ops')
    .from('event_gear_items')
    .insert({
      event_id: ctx.eventId,
      workspace_id: ctx.workspaceId,
      name: bundle.packageName,
      quantity: bundle.headerQuantity,
      status: 'allocated',
      catalog_package_id: bundle.catalogPackageId,
      is_sub_rental: bundle.wholeRowMeta.isSubRental,
      department: bundle.wholeRowMeta.department,
      sort_order: sortOrder,
      lineage_source: 'proposal',
      proposal_item_id: bundle.headerProposalItemId,
      package_instance_id: bundle.packageInstanceId,
      package_snapshot: bundle.packageSnapshot,
      is_package_parent: false,
    });
  if (error) {
    console.error('[CRM] syncGearFromProposalToEvent (whole bundle):', error.message);
    return null;
  }
  return { rowsInserted: 1, linkedChildIds: [] };
}

async function insertBundleParent(
  ctx: WriteContext,
  bundle: ProposalGearBundle,
  sortOrder: number,
): Promise<string | null> {
  const { data, error } = await ctx.supabase
    .schema('ops')
    .from('event_gear_items')
    .insert({
      event_id: ctx.eventId,
      workspace_id: ctx.workspaceId,
      name: bundle.packageName,
      quantity: bundle.headerQuantity,
      status: 'allocated',
      catalog_package_id: bundle.catalogPackageId,
      is_sub_rental: false,
      department: null,
      sort_order: sortOrder,
      lineage_source: 'proposal',
      proposal_item_id: bundle.headerProposalItemId,
      package_instance_id: bundle.packageInstanceId,
      package_snapshot: bundle.packageSnapshot,
      is_package_parent: true,
    })
    .select('id')
    .single();
  if (error || !data) {
    console.error('[CRM] syncGearFromProposalToEvent (parent):', error?.message);
    return null;
  }
  return data.id;
}

async function insertBundleChildren(
  ctx: WriteContext,
  bundle: ProposalGearBundle,
  parentId: string,
  childStartingSort: number,
): Promise<boolean> {
  const inserts = bundle.children.map((child, idx) => ({
    event_id: ctx.eventId,
    workspace_id: ctx.workspaceId,
    name: child.name,
    quantity: child.quantity,
    status: 'allocated' as const,
    catalog_package_id: child.catalogPackageId,
    is_sub_rental: child.isSubRental,
    department: child.department,
    sort_order: childStartingSort + idx,
    lineage_source: 'proposal',
    proposal_item_id: child.proposalItemId,
    parent_gear_item_id: parentId,
    package_instance_id: bundle.packageInstanceId,
    is_package_parent: false,
  }));

  const { error } = await ctx.supabase.schema('ops').from('event_gear_items').insert(inserts);
  if (error) {
    console.error('[CRM] syncGearFromProposalToEvent (children):', error.message);
    return false;
  }
  return true;
}
