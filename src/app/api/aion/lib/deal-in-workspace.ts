/**
 * deal_in_workspace helper — wraps the public.deal_in_workspace(p_deal_id)
 * SECURITY DEFINER RPC with a typed, boundary-caught call.
 *
 * Every Aion write handler in src/app/api/aion/chat/tools/writes.ts MUST
 * call this before accepting a deal_id param. Returns FALSE on any of:
 *   • deal doesn't exist
 *   • deal exists but is in a different workspace
 *   • caller is not a workspace member
 *   • RPC errored out (fail-closed)
 *
 * No enumeration oracle — all failure modes collapse to `false`. Callers
 * should treat `false` as a hard cross-workspace block and return a typed
 * envelope with `reason: 'deal_not_found'`.
 *
 * Migration: supabase/migrations/20260521000000_aion_write_log_and_deal_in_workspace.sql
 */

import { createClient } from '@/shared/api/supabase/server';

export async function dealInWorkspace(dealId: string | null | undefined): Promise<boolean> {
  if (!dealId) return false;

  try {
    const supabase = await createClient();
    const { data, error } = await supabase.rpc('deal_in_workspace', { p_deal_id: dealId });
    if (error) {
      console.warn(`[aion.deal_in_workspace] rpc_error deal=${dealId} error=${error.message}`);
      return false;
    }
    return data === true;
  } catch (err) {
    console.warn(
      `[aion.deal_in_workspace] exception deal=${dealId} err=${
        err instanceof Error ? err.message : 'unknown'
      }`,
    );
    return false;
  }
}
