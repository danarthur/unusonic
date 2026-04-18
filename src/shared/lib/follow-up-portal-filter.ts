/**
 * Portal-safe follow-up reader.
 *
 * Portal routes (everything under `src/app/(portal)/` and `src/app/(public)/`)
 * must never surface `ops.follow_up_queue` rows where `hide_from_portal=true`.
 * This helper routes every portal-scope read through `ops.portal_follow_up_queue`,
 * a view that inlines `hide_from_portal = false AND superseded_at IS NULL AND
 * status = 'pending'`.
 *
 * Two lines of defense:
 *   1. App-level: import this helper from portal fetchers.
 *   2. DB-level: the view has `security_invoker = true`, so RLS on the
 *      underlying table still applies — a caller using the wrong client
 *      can still be denied.
 *
 * Never import from inside `/(dashboard)/` code — the owner surface (CRM,
 * Today widget) reads the raw table with `hide_from_portal` as a facet.
 *
 * @module shared/lib/follow-up-portal-filter
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

export type PortalFollowUpRow = {
  id: string;
  workspace_id: string;
  deal_id: string;
  priority_score: number;
  reason: string;
  reason_type: string;
  suggested_channel: string | null;
  suggested_action: string | null;
  follow_up_category: string | null;
  context_snapshot: unknown;
  created_at: string;
};

type ReaderClient = SupabaseClient<Database> | SupabaseClient;

/**
 * Read all portal-visible follow-ups for a deal. Returns rows in descending
 * priority order.
 */
export async function readPortalFollowUpsForDeal(
  supabase: ReaderClient,
  dealId: string,
): Promise<PortalFollowUpRow[]> {
  const { data, error } = await (supabase as SupabaseClient)
    .schema('ops')
    .from('portal_follow_up_queue')
    .select(
      'id, workspace_id, deal_id, priority_score, reason, reason_type, suggested_channel, suggested_action, follow_up_category, context_snapshot, created_at',
    )
    .eq('deal_id', dealId)
    .order('priority_score', { ascending: false });

  if (error) {
    console.error('[portal-follow-up-filter] read failed:', error);
    return [];
  }

  return (data ?? []) as PortalFollowUpRow[];
}

/**
 * Read all portal-visible follow-ups for a workspace. Prefer the per-deal
 * reader when the caller already knows which deal.
 */
export async function readPortalFollowUpsForWorkspace(
  supabase: ReaderClient,
  workspaceId: string,
): Promise<PortalFollowUpRow[]> {
  const { data, error } = await (supabase as SupabaseClient)
    .schema('ops')
    .from('portal_follow_up_queue')
    .select(
      'id, workspace_id, deal_id, priority_score, reason, reason_type, suggested_channel, suggested_action, follow_up_category, context_snapshot, created_at',
    )
    .eq('workspace_id', workspaceId)
    .order('priority_score', { ascending: false });

  if (error) {
    console.error('[portal-follow-up-filter] read failed:', error);
    return [];
  }

  return (data ?? []) as PortalFollowUpRow[];
}
