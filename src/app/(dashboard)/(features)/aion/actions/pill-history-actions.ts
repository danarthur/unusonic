'use server';

/**
 * Pill-history server actions — Wk 10 D7.
 *
 *   - getPillHistoryForDeal(dealId, days?) — Sheet feed
 *   - markPillSeen(lineId)                  — stamps seen_at
 *   - submitPillFeedback(lineId, feedback)  — useful/not_useful chip
 *   - resurfaceMutedReason(workspaceId, signalType) — owner Resurface
 *   - getActiveSignalDisablesForWorkspace(workspaceId) — Sheet's muted strip
 *   - getUnseenPillCountsForDeals(dealIds)  — bulk badge-count fetch
 *
 * Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.7
 * Design: docs/reference/aion-pill-history-design.md
 */

import { createClient } from '@/shared/api/supabase/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { revalidatePath } from 'next/cache';
import { recordAionEvent } from '@/app/api/aion/lib/event-logger';

export type PillHistoryRow = {
  id: string;
  deal_id: string;
  workspace_id: string;
  signal_type: 'proposal_engagement' | 'money_event' | 'dead_silence';
  headline: string;
  artifact_ref: { kind: string; id: string };
  payload: Record<string, unknown>;
  created_at: string;
  expires_at: string;
  dismissed_at: string | null;
  dismissed_by: string | null;
  dismiss_reason: 'not_useful' | 'already_handled' | 'snooze' | null;
  resolved_at: string | null;
  seen_at: string | null;
  user_feedback: 'useful' | 'not_useful' | null;
  feedback_at: string | null;
};

export type ActiveSignalDisable = {
  signal_type: string;
  disabled_until: string;
  fires_sampled: number;
  not_useful_count: number;
  hit_rate: number;
  triggered_by: string | null;
  created_at: string;
};

export type PillFeedback = 'useful' | 'not_useful';

/**
 * Reverse-chronological history for the deal. Includes active + dismissed +
 * resolved pills in the window. Workspace-membership gated server-side.
 */
export async function getPillHistoryForDeal(
  dealId: string,
  days: number = 14,
): Promise<{ rows: PillHistoryRow[]; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('cortex')
    .rpc('list_aion_proactive_history', {
      p_deal_id: dealId,
      p_days: days,
    });

  if (error) {
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as PillHistoryRow[] };
}

/**
 * Wk 15a-ii — pill_dismiss telemetry helper. Lives here (not in the dismiss
 * action's own file) so that file's source-discipline guard against
 * getSystemClient stays clean — the dismiss path proper goes through the
 * SECURITY DEFINER RPC; only this telemetry sidecar uses service-role.
 *
 * Fire-and-forget by design: a telemetry hiccup never blocks the dismiss
 * action's success path.
 */
export async function recordPillDismissTelemetry(
  lineId: string,
  reason: 'not_useful' | 'already_handled' | 'snooze',
): Promise<void> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    const system = getSystemClient();
    const { data: line } = await system
      .schema('cortex')
      .from('aion_proactive_lines')
      .select('workspace_id, signal_type, deal_id')
      .eq('id', lineId)
      .maybeSingle();
    if (!line) return;

    await recordAionEvent({
      eventType:   'aion.pill_dismiss',
      workspaceId: line.workspace_id,
      userId:      user.id,
      payload: {
        line_id:     lineId,
        signal_type: line.signal_type,
        deal_id:     line.deal_id,
        reason,
      },
    });
  } catch {
    // Telemetry never throws into the action's success path.
  }
}

/**
 * Wk 15a-ii — pill_click telemetry. Fired when the owner taps the pill
 * headline (Ask Aion → handler in proactive-line-pill.tsx). The aion.pill_emit
 * counterpart fires from the cron emit path; the ratio is the §3.10 card 5
 * click-through-rate metric. Fire-and-forget — never blocks the chat handler.
 */
export async function recordPillClick(
  lineId: string,
): Promise<{ success: boolean; error?: string }> {
  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return { success: false, error: 'Not authenticated.' };

    const system = getSystemClient();
    const { data: line } = await system
      .schema('cortex')
      .from('aion_proactive_lines')
      .select('workspace_id, signal_type, deal_id')
      .eq('id', lineId)
      .maybeSingle();
    if (!line) return { success: false, error: 'Pill not found.' };

    await recordAionEvent({
      eventType:   'aion.pill_click',
      workspaceId: line.workspace_id,
      userId:      user.id,
      payload: {
        line_id:     lineId,
        signal_type: line.signal_type,
        deal_id:     line.deal_id,
      },
    });
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : 'Telemetry failed.',
    };
  }
}

/**
 * Idempotent — first stamp wins. Called on pinned-pill render and on each
 * Sheet-row view to clear the badge.
 */
export async function markPillSeen(
  lineId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('cortex')
    .rpc('mark_pill_seen', { p_line_id: lineId });

  if (error) return { success: false, error: error.message };
  if (data !== true) return { success: false, error: 'Pill not found.' };
  return { success: true };
}

/**
 * Per-row useful/not_useful feedback chip. Last write wins (owner can flip
 * their mind). Does NOT feed D6 — D6 fires only on explicit dismissals.
 */
export async function submitPillFeedback(
  lineId: string,
  feedback: PillFeedback,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('cortex')
    .rpc('submit_pill_feedback', {
      p_line_id: lineId,
      p_feedback: feedback,
    });

  if (error) return { success: false, error: error.message };
  if (data !== true) return { success: false, error: 'Pill not found.' };
  return { success: true };
}

/**
 * Owner Resurface from the Sheet's muted-reason strip. Drops the workspace
 * disable for this signal_type AND the caller's per-user mutes for that
 * signal_type in this workspace. Other users' mutes are not touched.
 */
export async function resurfaceMutedReason(
  workspaceId: string,
  signalType: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('cortex')
    .rpc('resurface_muted_reason', {
      p_workspace_id: workspaceId,
      p_signal_type: signalType,
    });

  if (error) return { success: false, error: error.message };
  if (data !== true) return { success: false, error: 'Resurface failed.' };

  revalidatePath('/crm');
  return { success: true };
}

/**
 * Active workspace-wide disables for the Sheet's muted-reason strip. RLS on
 * cortex.aion_workspace_signal_disables is "no policies" (cessation-school
 * design — all writes via SECURITY DEFINER RPCs), so this read goes through
 * the system client behind a server-side workspace-member check.
 *
 * Returns one row per (workspace, signal_type) currently disabled.
 */
export async function getActiveSignalDisablesForWorkspace(
  workspaceId: string,
): Promise<{ rows: ActiveSignalDisable[]; error?: string }> {
  // Workspace-member check via the user client first.
  const userClient = await createClient();
  const { data: { user } } = await userClient.auth.getUser();
  if (!user) return { rows: [], error: 'Not authenticated.' };

  const { data: membership, error: memErr } = await userClient
    .from('workspace_members')
    .select('user_id')
    .eq('workspace_id', workspaceId)
    .eq('user_id', user.id)
    .maybeSingle();
  if (memErr || !membership) return { rows: [], error: 'Not a workspace member.' };

  // System-client read — cessation-school table has no client RLS policies.
  const system = getSystemClient();
  const { data, error } = await system
    .schema('cortex')
    .from('aion_workspace_signal_disables')
    .select('signal_type, disabled_until, fires_sampled, not_useful_count, hit_rate, triggered_by, created_at')
    .eq('workspace_id', workspaceId)
    .gt('disabled_until', new Date().toISOString())
    .order('created_at', { ascending: false });

  if (error) return { rows: [], error: error.message };
  return { rows: (data ?? []) as ActiveSignalDisable[] };
}

/**
 * Bulk badge-count fetch — one round trip for many deals. Returns
 * Record<dealId, unseenCount> so a parent that renders N cards can resolve
 * the dot per card without N+1 reads.
 *
 * The query is shaped to match the Wk 10 partial index
 * `cortex.aion_proactive_lines_unseen_per_deal_idx`
 *   (deal_id, expires_at DESC) WHERE dismissed_at IS NULL AND resolved_at IS NULL AND seen_at IS NULL
 * The volatile `expires_at > now()` predicate lives outside the index but the
 * planner can range-scan against the indexed expires_at column for a tight plan.
 *
 * RLS: cortex.aion_proactive_lines has SELECT for authenticated where
 * `workspace_id IN get_my_workspace_ids()` — a cross-workspace deal_id passed
 * by a malicious caller is silently filtered out, so no separate workspace
 * gate is needed here. Empty input short-circuits to {}.
 */
export async function getUnseenPillCountsForDeals(
  dealIds: string[],
): Promise<Record<string, number>> {
  if (dealIds.length === 0) return {};

  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .schema('cortex')
    .from('aion_proactive_lines')
    .select('deal_id')
    .in('deal_id', dealIds)
    .is('dismissed_at', null)
    .is('resolved_at', null)
    .is('seen_at', null)
    .gt('expires_at', nowIso);

  if (error || !data) return {};

  const counts: Record<string, number> = {};
  for (const row of data as Array<{ deal_id: string }>) {
    counts[row.deal_id] = (counts[row.deal_id] ?? 0) + 1;
  }
  return counts;
}
