'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { DismissalReasonSchema, type DismissalReason } from '@/shared/lib/triggers/schema';
import type { Json } from '@/types/supabase';
import { updateDealStatus, type DealStatus, type DealStatusOverride } from './update-deal-status';

/**
 * Server actions backing the Aion stage-move suggestion row.
 *
 * The row offers two buttons: Accept (advance the deal to the target stage
 * and fire the stage's on_enter triggers) and Reject (record the reason and
 * mark the insight dismissed). Both paths are idempotent — a double-click
 * or a racing Stripe webhook advance won't corrupt state.
 */

const STATUS_SLUGS: readonly string[] = [
  'lost',
  'inquiry',
  'proposal',
  'contract_sent',
  'contract_signed',
  'deposit_received',
  'won',
];

/**
 * Accept a suggested stage move. Resolves the target stage by tag (not slug),
 * advances the deal, and dismisses the originating insight.
 *
 * P0 wiring: calls `updateDealStatus` with the target stage slug. P1 will
 * add a `advance_stage_by_tag` DB RPC so workspaces that renamed stages can
 * skip the slug resolution round-trip.
 */
export async function acceptStageSuggestion(
  dealId: string,
  insightId: string,
  targetTag: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  const supabase = await createClient();

  // Resolve the target stage by tag on this workspace's default pipeline.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema
  const { data: stages } = await supabase
    .schema('ops')
    .from('pipeline_stages')
    .select('id, slug, tags, kind, pipeline_id, pipelines!inner(workspace_id, is_default)')
    .eq('pipelines.workspace_id', workspaceId)
    .eq('pipelines.is_default', true);

  const stageRow = ((stages ?? []) as Array<{
    id: string;
    slug: string;
    tags: string[];
    kind: string;
  }>).find((s) => Array.isArray(s.tags) && s.tags.includes(targetTag));

  if (!stageRow) {
    return {
      success: false,
      error: `No pipeline stage found for target tag "${targetTag}". The workspace may have removed it.`,
    };
  }

  // Defensive: only allow slugs we recognise. Workspaces that renamed to an
  // unknown slug must fall back to the DB-level advance path, which arrives
  // in P1.
  if (!STATUS_SLUGS.includes(stageRow.slug)) {
    return {
      success: false,
      error: `Stage "${stageRow.slug}" cannot be advanced via the legacy status API; upgrade to advance_stage_by_tag.`,
    };
  }

  const result = await updateDealStatus(dealId, stageRow.slug as DealStatus | DealStatusOverride);
  if (!result.success) return result;

  // Dismiss the originating insight so it doesn't re-suggest. Uses the
  // service client because cortex schema isn't fully PostgREST-exposed.
  const system = getSystemClient();
  await system
    .schema('cortex')
    .from('aion_insights')
    .update({ status: 'dismissed' })
    .eq('id', insightId)
    .eq('workspace_id', workspaceId);

  revalidatePath('/productions');
  revalidatePath(`/productions/deal/${dealId}`);
  return { success: true };
}

/**
 * Reject a suggested stage move. Records the owner's dismissal reason on
 * the originating insight and (if provided) learns from "other" free text.
 * The deal's stage does not change.
 *
 * P1 will pipe the reason + free text into cortex.aion_memory so future
 * suggestions on similar deals respect the owner's taste.
 */
export async function rejectStageSuggestion(
  insightId: string,
  reason: DismissalReason,
  reasonText?: string,
): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = DismissalReasonSchema.safeParse(reason);
  if (!parsed.success) return { success: false, error: 'Invalid dismissal reason.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  // Verify caller is a workspace member before the service-role read/write.
  const authed = await createClient();
  const { data: membership } = await authed
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  if (!membership) return { success: false, error: 'Not a workspace member.' };

  // cortex schema isn't fully PostgREST-exposed; use the service client with
  // explicit workspace scoping.
  const system = getSystemClient();

  const { data: insight } = await system
    .schema('cortex')
    .from('aion_insights')
    .select('id, context, status')
    .eq('id', insightId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!insight) return { success: false, error: 'Insight not found.' };

  const existingContext = ((insight as { context: Record<string, unknown> | null }).context ?? {}) as Record<string, unknown>;
  const nextContext: Record<string, unknown> = {
    ...existingContext,
    dismissal_reason: parsed.data,
    dismissed_at: new Date().toISOString(),
  };
  if (parsed.data === 'other' && reasonText) {
    nextContext.dismissal_reason_text = reasonText.slice(0, 2000);
  }

  const { error } = await system
    .schema('cortex')
    .from('aion_insights')
    .update({ status: 'dismissed', context: nextContext as Json })
    .eq('id', insightId)
    .eq('workspace_id', workspaceId);

  if (error) return { success: false, error: error.message };

  revalidatePath('/productions');
  return { success: true };
}

/**
 * Fetch the single top insight for a deal that has a suggested stage move.
 * Returns null when no actionable suggestion exists. Used by AionSuggestionRow.
 */
export async function getStageSuggestionForDeal(
  dealId: string,
): Promise<{
  insightId: string;
  title: string;
  suggestedAction: string | null;
  targetTag: string | null;
} | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  // Workspace scoping is enforced explicitly via .eq('workspace_id', workspaceId)
  // below. We use the service-role client because cortex schema isn't fully
  // exposed via PostgREST — the authenticated client's .schema('cortex')
  // calls silently return empty. Same pattern as
  // src/widgets/todays-brief/api/get-brief-and-insights.ts.
  const system = getSystemClient();

  // Confirm the caller is actually a member of this workspace before the
  // system-role read bypasses RLS. Without this check, any authenticated
  // user could pass an arbitrary workspace_id through getActiveWorkspaceId
  // cookie tampering.
  const authed = await createClient();
  const { data: membership } = await authed
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  if (!membership) return null;

  const { data } = await system
    .schema('cortex')
    .from('aion_insights')
    .select('id, title, context, priority')
    .eq('workspace_id', workspaceId)
    .eq('entity_id', dealId)
    .in('status', ['pending', 'surfaced'])
    .order('priority', { ascending: false })
    .limit(1);

  const row = (data ?? [])[0] as
    | { id: string; title: string; context: Record<string, unknown> | null }
    | undefined;
  if (!row) return null;

  const ctx = (row.context ?? {}) as Record<string, unknown>;
  const suggestedTag =
    typeof ctx.suggested_stage_tag === 'string' ? ctx.suggested_stage_tag : null;
  if (!suggestedTag) return null;

  return {
    insightId: row.id,
    title: row.title,
    suggestedAction:
      typeof ctx.suggestedAction === 'string' ? ctx.suggestedAction : null,
    targetTag: suggestedTag,
  };
}

export type StageSuggestion = {
  insightId: string;
  title: string;
  suggestedAction: string | null;
  targetTag: string | null;
};

/**
 * Bulk fetch — resolve stage suggestions for many deals in one server-action
 * round trip. Mirrors the `getUnseenPillCountsForDeals` pattern in
 * pill-history-actions.ts.
 *
 * Returns a `Record<dealId, StageSuggestion | null>`. Deals with no actionable
 * suggestion get `null`. Deals not in the workspace are silently dropped.
 *
 * Existed to fix the N+1 cascade where every stream-card mounted and fired
 * its own `getStageSuggestionForDeal` independently — 10 visible cards =
 * 10 server-action POSTs each carrying ~700ms of proxy.ts auth overhead in
 * dev. With this batch the stream pays a single round-trip up front.
 */
export async function getStageSuggestionsForDeals(
  dealIds: string[],
): Promise<Record<string, StageSuggestion>> {
  if (dealIds.length === 0) return {};

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return {};

  const authed = await createClient();
  const { data: membership } = await authed
    .from('workspace_members')
    .select('workspace_id')
    .eq('workspace_id', workspaceId)
    .limit(1)
    .maybeSingle();
  if (!membership) return {};

  const system = getSystemClient();

  // Fetch active insights for all deals in one query. Order by priority desc
  // so the first row per deal is the top suggestion; we DISTINCT-ON in JS.
  const { data } = await system
    .schema('cortex')
    .from('aion_insights')
    .select('id, entity_id, title, context, priority')
    .eq('workspace_id', workspaceId)
    .in('entity_id', dealIds)
    .in('status', ['pending', 'surfaced'])
    .order('entity_id')
    .order('priority', { ascending: false });

  const out: Record<string, StageSuggestion> = {};
  for (const row of (data ?? []) as Array<{
    id: string;
    entity_id: string;
    title: string;
    context: Record<string, unknown> | null;
  }>) {
    if (out[row.entity_id]) continue; // already took the highest-priority row
    const ctx = (row.context ?? {}) as Record<string, unknown>;
    const suggestedTag =
      typeof ctx.suggested_stage_tag === 'string' ? ctx.suggested_stage_tag : null;
    if (!suggestedTag) continue;
    out[row.entity_id] = {
      insightId: row.id,
      title: row.title,
      suggestedAction:
        typeof ctx.suggestedAction === 'string' ? ctx.suggestedAction : null,
      targetTag: suggestedTag,
    };
  }

  return out;
}
