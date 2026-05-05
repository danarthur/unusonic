'use server';

/**
 * Targeted "accept add" insert paths for Phase 3 drift acceptance.
 *
 * Lifted out of gear-drift.ts so the action module stays under the file-size
 * cap. Each entry point handles one shape (standalone, service, bundle
 * header, bundle child); acceptGearDriftAdd dispatches via the plan.
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { planGearFromProposal } from './plan-gear-from-proposal';
import type {
  ProposalGearBundle,
  ProposalGearChild,
  ProposalGearService,
  ProposalGearStandalone,
} from './plan-gear-from-proposal-types';
import type { DriftMutationResult } from './gear-drift-types';

const UuidSchema = z.string().uuid();

const AcceptAddSchema = z.object({
  eventId: UuidSchema,
  proposalItemId: UuidSchema,
});

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

type AcceptCtx = {
  supabase: SupabaseServerClient;
  eventId: string;
  workspaceId: string;
};

async function nextSortOrder(ctx: AcceptCtx): Promise<number> {
  const { data } = await ctx.supabase
    .schema('ops')
    .from('event_gear_items')
    .select('sort_order')
    .eq('event_id', ctx.eventId)
    .eq('workspace_id', ctx.workspaceId)
    .order('sort_order', { ascending: false })
    .limit(1);
  return ((data?.[0] as { sort_order: number } | undefined)?.sort_order ?? -1) + 1;
}

async function resolveDealId(
  supabase: SupabaseServerClient,
  eventId: string,
  workspaceId: string,
): Promise<string | null> {
  const { data: event } = await supabase
    .schema('ops')
    .from('events')
    .select('id, project:projects!inner(workspace_id)')
    .eq('id', eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();
  if (!event) return null;

  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  return deal?.id ?? null;
}

async function insertOneStandalone(
  ctx: AcceptCtx,
  item: ProposalGearStandalone,
): Promise<DriftMutationResult> {
  const sort = await nextSortOrder(ctx);
  const { error } = await ctx.supabase.schema('ops').from('event_gear_items').insert({
    event_id: ctx.eventId,
    workspace_id: ctx.workspaceId,
    name: item.name,
    quantity: item.quantity,
    status: 'allocated',
    catalog_package_id: item.catalogPackageId,
    is_sub_rental: item.isSubRental,
    department: item.department,
    sort_order: sort,
    lineage_source: 'proposal',
    proposal_item_id: item.proposalItemId,
    is_package_parent: false,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function insertOneServiceParent(
  ctx: AcceptCtx,
  item: ProposalGearService,
): Promise<DriftMutationResult> {
  const sort = await nextSortOrder(ctx);
  const { error } = await ctx.supabase.schema('ops').from('event_gear_items').insert({
    event_id: ctx.eventId,
    workspace_id: ctx.workspaceId,
    name: item.serviceName,
    quantity: item.quantity,
    status: 'allocated',
    catalog_package_id: item.catalogPackageId,
    is_sub_rental: false,
    department: null,
    sort_order: sort,
    lineage_source: 'proposal',
    proposal_item_id: item.proposalItemId,
    package_instance_id: item.packageInstanceId,
    package_snapshot: item.packageSnapshot,
    is_package_parent: true,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function findExistingBundleParentId(
  ctx: AcceptCtx,
  bundle: ProposalGearBundle,
): Promise<string | null> {
  const { data } = await ctx.supabase
    .schema('ops')
    .from('event_gear_items')
    .select('id')
    .eq('event_id', ctx.eventId)
    .eq('workspace_id', ctx.workspaceId)
    .eq('proposal_item_id', bundle.headerProposalItemId)
    .eq('is_package_parent', true)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

async function insertOneBundleChild(
  ctx: AcceptCtx,
  bundle: ProposalGearBundle,
  child: ProposalGearChild,
): Promise<DriftMutationResult> {
  const parentId = await findExistingBundleParentId(ctx, bundle);
  if (!parentId) return { success: false, error: 'Bundle parent missing — accept the package first.' };
  const sort = await nextSortOrder(ctx);
  const { error } = await ctx.supabase.schema('ops').from('event_gear_items').insert({
    event_id: ctx.eventId,
    workspace_id: ctx.workspaceId,
    name: child.name,
    quantity: child.quantity,
    status: 'allocated',
    catalog_package_id: child.catalogPackageId,
    is_sub_rental: child.isSubRental,
    department: child.department,
    sort_order: sort,
    lineage_source: 'proposal',
    proposal_item_id: child.proposalItemId,
    parent_gear_item_id: parentId,
    package_instance_id: bundle.packageInstanceId,
    is_package_parent: false,
  });
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function insertBundleParent(
  ctx: AcceptCtx,
  bundle: ProposalGearBundle,
  sortOrder: number,
): Promise<{ id: string } | { error: string }> {
  const isWhole = !bundle.decomposed;
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
      is_sub_rental: isWhole ? bundle.wholeRowMeta.isSubRental : false,
      department: isWhole ? bundle.wholeRowMeta.department : null,
      sort_order: sortOrder,
      lineage_source: 'proposal',
      proposal_item_id: bundle.headerProposalItemId,
      package_instance_id: bundle.packageInstanceId,
      package_snapshot: bundle.packageSnapshot,
      is_package_parent: !isWhole,
    })
    .select('id')
    .single();
  if (error || !data) return { error: error?.message ?? 'Insert failed.' };
  return { id: data.id };
}

async function insertBundleChildren(
  ctx: AcceptCtx,
  bundle: ProposalGearBundle,
  parentId: string,
  startingSort: number,
): Promise<DriftMutationResult> {
  const childInserts = bundle.children.map((c, idx) => ({
    event_id: ctx.eventId,
    workspace_id: ctx.workspaceId,
    name: c.name,
    quantity: c.quantity,
    status: 'allocated' as const,
    catalog_package_id: c.catalogPackageId,
    is_sub_rental: c.isSubRental,
    department: c.department,
    sort_order: startingSort + idx,
    lineage_source: 'proposal',
    proposal_item_id: c.proposalItemId,
    parent_gear_item_id: parentId,
    package_instance_id: bundle.packageInstanceId,
    is_package_parent: false,
  }));
  const { error } = await ctx.supabase.schema('ops').from('event_gear_items').insert(childInserts);
  if (error) return { success: false, error: error.message };
  return { success: true };
}

async function insertOneFullBundle(
  ctx: AcceptCtx,
  bundle: ProposalGearBundle,
): Promise<DriftMutationResult> {
  const sortStart = await nextSortOrder(ctx);
  const parent = await insertBundleParent(ctx, bundle, sortStart);
  if ('error' in parent) return { success: false, error: parent.error };
  if (!bundle.decomposed || bundle.children.length === 0) return { success: true };

  const childResult = await insertBundleChildren(ctx, bundle, parent.id, sortStart + 1);
  if (!childResult.success) {
    await ctx.supabase.schema('ops').from('event_gear_items').delete().eq('id', parent.id);
  }
  return childResult;
}

async function dispatchPlanItem(
  ctx: AcceptCtx,
  item: import('./plan-gear-from-proposal-types').ProposalGearPlanItem,
  target: string,
): Promise<DriftMutationResult | null> {
  if (item.kind === 'standalone' && item.proposalItemId === target) {
    return insertOneStandalone(ctx, item);
  }
  if (item.kind === 'service' && item.proposalItemId === target) {
    return insertOneServiceParent(ctx, item);
  }
  if (item.kind === 'bundle') {
    if (item.headerProposalItemId === target) return insertOneFullBundle(ctx, item);
    const child = item.children.find((c) => c.proposalItemId === target);
    if (child) return insertOneBundleChild(ctx, item, child);
  }
  return null;
}

export async function acceptGearDriftAdd(
  input: { eventId: string; proposalItemId: string },
): Promise<DriftMutationResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const parsed = AcceptAddSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const supabase = await createClient();
  const dealId = await resolveDealId(supabase, parsed.data.eventId, workspaceId);
  if (!dealId) return { success: false, error: 'Deal not found.' };

  const plan = await planGearFromProposal(dealId);
  if (!plan) return { success: false, error: 'Plan not available.' };

  const ctx: AcceptCtx = { supabase, eventId: parsed.data.eventId, workspaceId };

  for (const item of plan.items) {
    const result = await dispatchPlanItem(ctx, item, parsed.data.proposalItemId);
    if (result) return result;
  }
  return { success: false, error: 'Plan item not found for proposal_item_id.' };
}
