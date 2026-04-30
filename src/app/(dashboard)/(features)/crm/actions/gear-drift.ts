'use server';

/**
 * Gear drift detection + per-line accept/reject (Phase 3 of the
 * proposal→gear lineage plan, §5).
 *
 * Drift = the proposal changed after handoff. We surface a diff to the PM
 * (banner + review sheet) and let them accept or reject per line. No
 * auto-mirror — User Advocate's research called this out as the failure
 * mode that breaks PM trust in the gear card.
 *
 * Public types live in `./gear-drift-types.ts` because Next.js 'use server'
 * modules cannot export type names. Pure compute helpers live in
 * `./gear-drift-helpers.ts`. The targeted "accept add" insert paths live in
 * `./gear-drift-accept-add.ts` so this module stays under the file-size cap.
 */

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { planGearFromProposal } from './plan-gear-from-proposal';
import {
  buildExisting,
  buildExpected,
  computeAddsAndQtyDrifts,
  computeRemoves,
  indexDismissals,
  indexUpdatedAt,
  latestUpdatedAt,
  type GearRow,
} from './gear-drift-helpers';
import type {
  DriftMutationResult,
  GearDrift,
  GearDriftReport,
} from './gear-drift-types';

const UuidSchema = z.string().uuid();

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

const EMPTY_REPORT: GearDriftReport = {
  drifts: [],
  proposalLastChangedAt: null,
  proposalId: null,
};

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

async function fetchDriftInputs(
  supabase: SupabaseServerClient,
  eventId: string,
  workspaceId: string,
  proposalId: string,
) {
  const [proposalRows, gearRows, dismissalRows] = await Promise.all([
    supabase.from('proposal_items').select('id, updated_at').eq('proposal_id', proposalId),
    supabase
      .schema('ops')
      .from('event_gear_items')
      .select('id, proposal_item_id, parent_gear_item_id, quantity, lineage_source, name, is_package_parent, package_instance_id')
      .eq('event_id', eventId)
      .eq('workspace_id', workspaceId),
    supabase
      .schema('ops')
      .from('gear_drift_dismissals')
      .select('proposal_item_id, proposal_item_updated_at')
      .eq('event_id', eventId)
      .eq('workspace_id', workspaceId),
  ]);
  return {
    proposalRows: (proposalRows.data ?? []) as { id: string; updated_at: string }[],
    gearRows: (gearRows.data ?? []) as GearRow[],
    dismissalRows: (dismissalRows.data ?? []) as { proposal_item_id: string; proposal_item_updated_at: string }[],
  };
}

export async function getGearDriftForEvent(eventId: string): Promise<GearDriftReport> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return EMPTY_REPORT;

  const idParsed = UuidSchema.safeParse(eventId);
  if (!idParsed.success) return EMPTY_REPORT;

  const supabase = await createClient();

  const dealId = await resolveDealId(supabase, eventId, workspaceId);
  if (!dealId) return EMPTY_REPORT;

  const plan = await planGearFromProposal(dealId);
  if (!plan) return EMPTY_REPORT;

  const { proposalRows, gearRows, dismissalRows } = await fetchDriftInputs(
    supabase,
    eventId,
    workspaceId,
    plan.proposalId,
  );

  const updatedAt = indexUpdatedAt(proposalRows);
  const dismissals = indexDismissals(dismissalRows);
  const expected = buildExpected(plan);
  const existing = buildExisting(gearRows);

  const drifts: GearDrift[] = [
    ...computeAddsAndQtyDrifts(expected, existing, updatedAt, dismissals),
    ...computeRemoves(gearRows, expected, updatedAt, dismissals),
  ];

  return {
    drifts,
    proposalLastChangedAt: latestUpdatedAt(updatedAt),
    proposalId: plan.proposalId,
  };
}

// ── Mutations ───────────────────────────────────────────────────────────────

const DismissSchema = z.object({
  eventId: UuidSchema,
  proposalItemId: UuidSchema,
  proposalItemUpdatedAt: z.string(),
});

/**
 * Records a per-line dismissal pinned to the proposal_item version at
 * rejection time. If the proposal_item updates again, the diff re-surfaces
 * because the dismissal's frozen timestamp becomes stale.
 */
export async function dismissGearDrift(
  input: { eventId: string; proposalItemId: string; proposalItemUpdatedAt: string },
): Promise<DriftMutationResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const parsed = DismissSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('gear_drift_dismissals')
    .insert({
      event_id: parsed.data.eventId,
      workspace_id: workspaceId,
      proposal_item_id: parsed.data.proposalItemId,
      proposal_item_updated_at: parsed.data.proposalItemUpdatedAt,
    });
  if (error) {
    console.error('[CRM] dismissGearDrift:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

const AcceptQtySchema = z.object({
  gearItemId: UuidSchema,
  newQuantity: z.number().int().min(1),
});

/** Updates a single gear row's quantity to match the proposal. */
export async function acceptGearDriftQty(
  input: { gearItemId: string; newQuantity: number },
): Promise<DriftMutationResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const parsed = AcceptQtySchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .update({ quantity: parsed.data.newQuantity })
    .eq('id', parsed.data.gearItemId)
    .eq('workspace_id', workspaceId);
  if (error) {
    console.error('[CRM] acceptGearDriftQty:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

const AcceptRemoveSchema = z.object({
  gearItemId: UuidSchema,
});

/**
 * Hard-deletes the gear row (proposal removed it). The CASCADE on
 * parent_gear_item_id handles children of a parent being removed.
 */
export async function acceptGearDriftRemove(
  input: { gearItemId: string },
): Promise<DriftMutationResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const parsed = AcceptRemoveSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const supabase = await createClient();
  const { error } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .delete()
    .eq('id', parsed.data.gearItemId)
    .eq('workspace_id', workspaceId);
  if (error) {
    console.error('[CRM] acceptGearDriftRemove:', error.message);
    return { success: false, error: error.message };
  }
  return { success: true };
}

// Targeted "accept add" lives in ./gear-drift-accept-add.ts — Next.js
// 'use server' modules cannot re-export from another module, so callers
// import it directly:
//   `import { acceptGearDriftAdd } from '.../gear-drift-accept-add'`
