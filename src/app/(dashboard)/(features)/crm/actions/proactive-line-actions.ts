'use server';

/**
 * Proactive-line server actions — Phase 2 Sprint 2 / Week 5.
 *
 * Thin server actions that power <ProactiveLinePill> on the deal card:
 *
 *   - getActiveProactiveLine(dealId) — read the single active line
 *   - dismissProactiveLine(lineId)   — mark dismissed
 *
 * Read uses the user-scoped client (RLS clamps workspace). Dismiss calls the
 * cortex RPC which performs its own auth + workspace-member check.
 *
 * Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.2.3 + §3.2.4.
 */

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';

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
 * dismissed, not resolved, and not yet expired. Expired/dismissed lines move
 * out of the pinned slot entirely per Critic §Risk 3 ("strike-through
 * soft-expire hides new alerts") — they belong to a separate history surface.
 *
 * Returns null when no active line exists.
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
  return data as ProactiveLine;
}

/**
 * Dismiss a proactive line. The cortex RPC enforces auth + workspace
 * membership; this action is a thin wrapper that also re-validates the deal
 * page so the optimistic UI clears cleanly.
 */
export async function dismissProactiveLine(
  lineId: string,
): Promise<{ success: boolean; error?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema('cortex')
    .rpc('dismiss_aion_proactive_line', { p_line_id: lineId });

  if (error) {
    return { success: false, error: error.message };
  }
  // RPC returns true on success, false when the line didn't exist / was
  // already dismissed. Either way there's nothing for us to undo.
  if (data !== true) {
    return { success: false, error: 'Line not found or already dismissed.' };
  }

  // Invalidate the CRM page so the pill disappears on the next render.
  revalidatePath('/crm');
  return { success: true };
}
