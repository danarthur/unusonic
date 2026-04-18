'use server';

/**
 * Server actions backing the unified Aion deal card (Fork C, Phase 4).
 *
 * Provides four capability groups:
 *   1. acceptAionCardAdvance  — accept a stage-advance suggestion with
 *      pre-flight idempotency + insight provenance
 *   2. revertAionCardAdvance  — 10s undo window after accept
 *   3. dismissAionCardPipeline — bare dismiss on a pipeline row (§9.2)
 *   4. logAionCardEvent       — unified telemetry namespace (§10.5)
 *
 * Outbound row actions (Draft, dismiss with reason, snooze) reuse the
 * existing follow-up-actions.ts surface — see deal-lens.tsx for the
 * integration wiring.
 *
 * All actions route through:
 *   - createClient() for workspace-membership validation (auth session
 *     carries the user) — per CLAUDE.md §RLS patterns + P0-5 defense.
 *   - getSystemClient() for cortex + ops writes because those schemas
 *     aren't PostgREST-exposed to authenticated callers; explicit
 *     workspace scoping enforced.
 *   - ops.record_deal_transition_with_actor RPC for the actual stage
 *     write — service-role only, threads suggestion_insight_id through
 *     session GUCs per design §8.1.
 */

import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type AdvanceAcceptResult =
  | { success: true; transitionId: string | null; priorStageId: string | null }
  | { success: false; error: string };

export type AdvanceRevertResult =
  | { success: true }
  | { success: false; error: string };

export type PipelineDismissResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Unified telemetry event shape (design §10.5). All card-driven actions
 * emit exactly one event per action — no double-write with legacy names.
 * The 30-day bridge period is handled analyst-side via UNION queries;
 * no double-firing here.
 */
export type AionCardEvent = {
  action:
    | 'accept_advance'
    | 'revert_advance'
    | 'dismiss_advance'
    | 'draft_nudge'
    | 'act_nudge'
    | 'dismiss_nudge'
    | 'snooze_nudge';
  dealId: string;
  cardVariant: 'both' | 'pipeline_only' | 'outbound_only' | 'collapsed';
  source: 'deal_lens' | 'stream_card' | 'brief';
  insightId?: string;
  followUpId?: string;
  noop?: boolean;        // true when the action short-circuited (already advanced / resolved)
  noopReason?: string;
};

// =============================================================================
// Accept a suggested stage advance
// =============================================================================

/**
 * Accept a pipeline-row stage advance. Pre-flight checks protect against:
 *   - Webhook racing the click (deal already at target stage → noop)
 *   - Insight concurrently resolved in another tab (noop)
 * On success, returns the transition_id (may be NULL if short-circuited)
 * plus the prior stage id so the undo path can revert.
 *
 * Routes through record_deal_transition_with_actor with:
 *   actor_kind='user'          — truth: the owner clicked
 *   actor_id=<uid>             — the clicking user
 *   suggestion_insight_id=<id> — Aion provenance, lives on the transition row
 */
export async function acceptAionCardAdvance(
  dealId: string,
  insightId: string,
  targetStageId: string,
): Promise<AdvanceAcceptResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const authed = await createClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in.' };

  // Workspace membership gate (defense-in-depth against cookie tampering).
  const { data: membership } = await authed
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  if (!membership) return { success: false, error: 'Not a workspace member.' };

  const system = getSystemClient();

  // Pre-flight (P1-4): capture current stage for the undo path + short-circuit
  // if the deal has already advanced (webhook raced) or insight resolved.
  const { data: dealRow } = await system
    .from('deals')
    .select('stage_id, workspace_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (!dealRow) return { success: false, error: 'Deal not found.' };
  const priorStageId = (dealRow as { stage_id: string | null }).stage_id;

  if (priorStageId === targetStageId) {
    // Already advanced — logging a noop event lets analytics see the race.
    await logAionCardEvent({
      action: 'accept_advance',
      dealId,
      cardVariant: 'pipeline_only',
      source: 'deal_lens',
      insightId,
      noop: true,
      noopReason: 'already_advanced',
    });
    return { success: true, transitionId: null, priorStageId };
  }

  const { data: insightRow } = await system
    .schema('cortex')
    .from('aion_insights')
    .select('id, status')
    .eq('id', insightId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();
  if (
    insightRow
    && !['pending', 'surfaced'].includes((insightRow as { status: string }).status)
  ) {
    await logAionCardEvent({
      action: 'accept_advance',
      dealId,
      cardVariant: 'pipeline_only',
      source: 'deal_lens',
      insightId,
      noop: true,
      noopReason: 'already_resolved',
    });
    return { success: true, transitionId: null, priorStageId };
  }

  // Stage advance via the explicit-actor RPC. The RPC sets session GUCs
  // that the record_deal_transition trigger reads to stamp
  // suggestion_insight_id + actor_kind on the new transition row.
  const { data: txnId, error: rpcErr } = await system
    .schema('ops')
    .rpc('record_deal_transition_with_actor', {
      p_deal_id: dealId,
      p_to_stage_id: targetStageId,
      p_actor_kind: 'user',
      p_actor_id: user.id,
      p_reason: 'aion_suggestion_accepted',
      p_suggestion_insight_id: insightId,
    });
  if (rpcErr) return { success: false, error: rpcErr.message };

  // Resolve the insight — the card reader filters on status so this hides
  // the row immediately on refetch.
  await system.schema('cortex').rpc('resolve_aion_insight', {
    p_trigger_type: 'stage_advance_suggestion',
    p_entity_id: dealId,
  });

  revalidatePath('/crm');
  revalidatePath(`/crm/deal/${dealId}`);

  await logAionCardEvent({
    action: 'accept_advance',
    dealId,
    cardVariant: 'pipeline_only',
    source: 'deal_lens',
    insightId,
  });

  return {
    success: true,
    transitionId: (txnId as string | null) ?? null,
    priorStageId,
  };
}

/**
 * Undo a just-accepted advance. Reverses the stage transition with
 * actor_kind='user' and reason='aion_suggestion_reverted' — so the
 * activity log tells the true story. Does NOT unresolve the insight
 * (design §10.1 step 5 — "we don't unresolve insights").
 */
export async function revertAionCardAdvance(
  dealId: string,
  priorStageId: string,
): Promise<AdvanceRevertResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const authed = await createClient();
  const { data: { user } } = await authed.auth.getUser();
  if (!user) return { success: false, error: 'Not signed in.' };

  const { data: membership } = await authed
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  if (!membership) return { success: false, error: 'Not a workspace member.' };

  const system = getSystemClient();

  const { error } = await system
    .schema('ops')
    .rpc('record_deal_transition_with_actor', {
      p_deal_id: dealId,
      p_to_stage_id: priorStageId,
      p_actor_kind: 'user',
      p_actor_id: user.id,
      p_reason: 'aion_suggestion_reverted',
      p_suggestion_insight_id: undefined,
    });
  if (error) return { success: false, error: error.message };

  revalidatePath('/crm');
  revalidatePath(`/crm/deal/${dealId}`);

  await logAionCardEvent({
    action: 'revert_advance',
    dealId,
    cardVariant: 'pipeline_only',
    source: 'deal_lens',
  });

  return { success: true };
}

// =============================================================================
// Dismiss a pipeline row (bare dismiss per §9.2)
// =============================================================================

/**
 * Low-friction pipeline dismiss. No reason picker — owner just closes the
 * row. Resolves the insight with a synthetic dismissed status.
 */
export async function dismissAionCardPipeline(
  dealId: string,
  insightId: string,
): Promise<PipelineDismissResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const authed = await createClient();
  const { data: membership } = await authed
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  if (!membership) return { success: false, error: 'Not a workspace member.' };

  const system = getSystemClient();
  const { error } = await system
    .schema('cortex')
    .from('aion_insights')
    .update({ status: 'dismissed' })
    .eq('id', insightId)
    .eq('workspace_id', workspaceId);
  if (error) return { success: false, error: error.message };

  revalidatePath(`/crm/deal/${dealId}`);

  await logAionCardEvent({
    action: 'dismiss_advance',
    dealId,
    cardVariant: 'pipeline_only',
    source: 'deal_lens',
    insightId,
  });

  return { success: true };
}

// =============================================================================
// Unified telemetry
// =============================================================================

/**
 * Log a single card-driven action. v1 writes to console + ops.deal_activity_log
 * so existing Aion timeline surfaces see the event without a schema change.
 * A dedicated analytics sink (Segment, PostHog, etc.) is a later pass;
 * when it lands, swap the implementation here and every call-site stays
 * stable.
 *
 * Non-blocking — errors are logged but never thrown. The caller's
 * happy path must not depend on telemetry landing.
 */
export async function logAionCardEvent(event: AionCardEvent): Promise<void> {
  try {
    // Dev observability: structured log so the event shape is obvious.
    // eslint-disable-next-line no-console
    console.log('[aion-card]', JSON.stringify(event));

    const workspaceId = await getActiveWorkspaceId();
    if (!workspaceId) return;

    const system = getSystemClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema cast
    await (system as any)
      .schema('ops')
      .from('deal_activity_log')
      .insert({
        workspace_id: workspaceId,
        deal_id: event.dealId,
        actor_kind: 'user',
        trigger_type: `aion_card_${event.action}`,
        action_summary: buildActionSummary(event),
        status: event.noop ? 'noop' : 'success',
        metadata: {
          card_variant: event.cardVariant,
          source: event.source,
          insight_id: event.insightId ?? null,
          follow_up_id: event.followUpId ?? null,
          noop_reason: event.noopReason ?? null,
        },
      });
  } catch (err) {
    // Intentionally swallowed — telemetry must never break the user's flow.
    // eslint-disable-next-line no-console
    console.error('[aion-card] logAionCardEvent failed:', err);
  }
}

function buildActionSummary(event: AionCardEvent): string {
  switch (event.action) {
    case 'accept_advance':
      return event.noop ? 'Aion advance: no-op' : 'Aion advance accepted';
    case 'revert_advance':
      return 'Aion advance reverted';
    case 'dismiss_advance':
      return 'Aion advance dismissed';
    case 'draft_nudge':
      return 'Aion nudge drafted';
    case 'act_nudge':
      return 'Aion nudge sent';
    case 'dismiss_nudge':
      return 'Aion nudge dismissed';
    case 'snooze_nudge':
      return 'Aion nudge snoozed';
  }
}
