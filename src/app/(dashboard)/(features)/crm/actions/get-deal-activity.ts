'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type DealActivityActorKind = 'user' | 'webhook' | 'system' | 'aion';
export type DealActivityStatus = 'success' | 'failed' | 'pending' | 'undone';

export type DealActivityEntry = {
  id: string;
  actionSummary: string;
  actorKind: DealActivityActorKind;
  status: DealActivityStatus;
  createdAt: string;
  /** Primitive type that fired (e.g. 'notify_role'). NULL for non-trigger-driven entries. */
  triggerType?: string | null;
  errorMessage?: string | null;
  undoToken?: string | null;
  undoneAt?: string | null;
};

// =============================================================================
// Limits
// =============================================================================

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// =============================================================================
// getDealActivity
// Reads the last N ops.deal_activity_log rows for a deal via the user-session
// client (RLS-scoped to the caller's workspaces). Returns [] on any failure —
// a missing audit log should not break the Deal Lens.
// =============================================================================

export async function getDealActivity(
  dealId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<DealActivityEntry[]> {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return [];

  const clampedLimit = Math.max(1, Math.min(MAX_LIMIT, Math.floor(limit)));

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();

    // Ops schema types aren't exposed via PostgREST yet (see CLAUDE.md §"Schema
    // source of truth"), so all ops.* callers cast to any when using .schema().
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- ops schema not in PostgREST exposed schemas; matches existing ops.* caller pattern
    const { data, error } = await (supabase as any)
      .schema('ops')
      .from('deal_activity_log')
      .select(
        'id, action_summary, actor_kind, status, created_at, trigger_type, error_message, undo_token, undone_at',
      )
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(clampedLimit);

    if (error || !data) return [];

    type Row = {
      id: string;
      action_summary: string;
      actor_kind: string;
      status: string;
      created_at: string;
      trigger_type: string | null;
      error_message: string | null;
      undo_token: string | null;
      undone_at: string | null;
    };

    return (data as Row[]).map((r) => ({
      id: r.id,
      actionSummary: r.action_summary,
      actorKind: r.actor_kind as DealActivityActorKind,
      status: r.status as DealActivityStatus,
      createdAt: r.created_at,
      triggerType: r.trigger_type,
      errorMessage: r.error_message,
      undoToken: r.undo_token,
      undoneAt: r.undone_at,
    }));
  } catch {
    return [];
  }
}
