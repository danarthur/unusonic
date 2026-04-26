'use server';

/**
 * Proactive-line server actions.
 *
 *   - getActiveProactiveLine(dealId) — read the single active line, gated by
 *     per-user mute (D6) + workspace disable (D8) via cortex.is_user_signal_muted.
 *   - dismissProactiveLine(lineId, reason) — Wk 10 D5 three-reason taxonomy.
 *
 * Read uses the user-scoped client (RLS clamps workspace). Dismiss calls the
 * cortex RPC which performs its own auth + workspace-member check and runs
 * the inline D6/D8 mute logic.
 *
 * Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.7.
 */

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { recordPillDismissTelemetry } from '@/app/(dashboard)/(features)/aion/actions/pill-history-actions';

export type DismissReason = 'not_useful' | 'already_handled' | 'snooze';

export type ProactiveLine = {
  id: string;
  deal_id: string;
  signal_type: 'proposal_engagement' | 'money_event' | 'dead_silence';
  headline: string;
  artifact_ref: { kind: string; id: string };
  payload: Record<string, unknown>;
  created_at: string;
  expires_at: string;
};

/**
 * Return the single active proactive line for a deal. "Active" = not
 * dismissed, not resolved, not expired, AND not silenced for the caller via
 * D6 per-user mute or D8 workspace disable. The mute check is a single RPC
 * round-trip after the row fetch — adds ~2-5ms but keeps muted signals out
 * of the pinned-pill slot per Wk 10 D6/D8 spec.
 *
 * Returns null when no active line exists OR the active line's signal_type
 * is muted for this caller.
 */
export async function getActiveProactiveLine(
  dealId: string,
): Promise<ProactiveLine | null> {
  const supabase = await createClient();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .schema('cortex')
    .from('aion_proactive_lines')
    .select('id, deal_id, signal_type, headline, artifact_ref, payload, created_at, expires_at')
    .eq('deal_id', dealId)
    .is('dismissed_at', null)
    .is('resolved_at', null)
    .gt('expires_at', nowIso)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error || !data) return null;
  const line = data as ProactiveLine;

  // D6/D8 gate — workspace disable trumps per-user; either suppresses render.
  const { data: muted } = await supabase
    .schema('cortex')
    .rpc('is_user_signal_muted', {
      p_signal_type: line.signal_type,
      p_deal_id: dealId,
    });
  if (muted === true) return null;

  return line;
}

/**
 * Dismiss a proactive line with a reason. The cortex RPC enforces auth +
 * workspace-member check, applies the snooze 24h floor for `snooze`, and
 * runs inline D6 (per-user 30d tuple mute) and D8 (workspace 30d disable)
 * checks for `not_useful`.
 *
 * Reason mapping (telemetry → owner UI):
 *   - already_handled  → "Got it"
 *   - not_useful       → "Not relevant"
 *   - snooze           → "Ask me later"
 */
export async function dismissProactiveLine(
  lineId: string,
  reason: DismissReason,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('cortex')
    .rpc('dismiss_aion_proactive_line', {
      p_line_id: lineId,
      p_reason: reason,
    });

  if (error) {
    return { success: false, error: error.message };
  }
  if (data !== true) {
    return { success: false, error: 'Line not found or already dismissed.' };
  }

  // Wk 15a-ii — pill_dismiss telemetry. Helper lives in pill-history-actions
  // so this file stays clean of any service-role import; the source-discipline
  // guard ensures the dismiss path itself never bypasses RLS.
  // Fire-and-forget.
  void recordPillDismissTelemetry(lineId, reason);

  revalidatePath('/crm');
  return { success: true };
}
