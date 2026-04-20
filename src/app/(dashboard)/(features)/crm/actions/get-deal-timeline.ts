'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type DealTimelineSource = 'activity' | 'follow_up';
export type DealTimelineActorKind = 'user' | 'webhook' | 'system' | 'aion';
export type DealTimelineStatus = 'success' | 'failed' | 'pending' | 'undone';

/**
 * Unified timeline row for the Deal Lens. Rows come from
 * ops.deal_timeline_v, which unions ops.deal_activity_log (trigger/system
 * side effects) + ops.follow_up_log (follow-up engine actions).
 *
 * Activity rows carry `triggerType` and the undo fields.
 * Follow-up rows carry `actionType`, `channel`, and a `content` blob on metadata.
 */
export type DealTimelineEntry = {
  id: string;
  source: DealTimelineSource;
  actionSummary: string;
  actorKind: DealTimelineActorKind;
  /** Auth user id, if the actor was a real human. */
  actorUserId?: string | null;
  /** Resolved display name. NULL for non-user actors (webhook/system/aion). */
  actorName?: string | null;
  status: DealTimelineStatus;
  createdAt: string;
  /** Activity-only: primitive trigger that fired. */
  triggerType?: string | null;
  /** Follow-up-only: the follow_up_log.action_type discriminator. */
  actionType?: string | null;
  /** Follow-up-only: sms | email | call | manual | system. */
  channel?: string | null;
  errorMessage?: string | null;
  undoToken?: string | null;
  undoneAt?: string | null;
  /** Source-specific extras (content/queue ref for follow-up, free jsonb for activity). */
  metadata?: Record<string, unknown> | null;
};

// =============================================================================
// Limits
// =============================================================================

const DEFAULT_LIMIT = 30;
const MAX_LIMIT = 100;

// =============================================================================
// getDealTimeline
// Reads the last N ops.deal_timeline_v rows for a deal via the user-session
// client. The view uses security_invoker=true, so the caller's RLS on the
// underlying tables (workspace-scoped SELECT on both deal_activity_log and
// follow_up_log) applies. Returns [] on any failure — a broken timeline
// should not break the Deal Lens.
// =============================================================================

export async function getDealTimeline(
  dealId: string,
  limit: number = DEFAULT_LIMIT,
): Promise<DealTimelineEntry[]> {
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
      .from('deal_timeline_v')
      .select(
        'id, source, action_summary, actor_kind, actor_user_id, status, created_at, trigger_type, action_type, channel, error_message, undo_token, undone_at, metadata',
      )
      .eq('deal_id', dealId)
      .order('created_at', { ascending: false })
      .limit(clampedLimit);

    if (error || !data) return [];

    type Row = {
      id: string;
      source: string;
      action_summary: string;
      actor_kind: string;
      actor_user_id: string | null;
      status: string;
      created_at: string;
      trigger_type: string | null;
      action_type: string | null;
      channel: string | null;
      error_message: string | null;
      undo_token: string | null;
      undone_at: string | null;
      metadata: Record<string, unknown> | null;
    };

    const rows = data as Row[];

    // Resolve display names for any user actors in one batch.
    const userIds = Array.from(
      new Set(rows.map((r) => r.actor_user_id).filter((id): id is string => !!id)),
    );
    const nameByUserId = new Map<string, string | null>();
    if (userIds.length > 0) {
      const { data: profileRows } = await supabase
        .from('profiles')
        .select('id, full_name')
        .in('id', userIds);
      for (const p of (profileRows ?? []) as { id: string; full_name: string | null }[]) {
        nameByUserId.set(p.id, p.full_name ?? null);
      }
    }

    return rows.map((r) => ({
      id: r.id,
      source: r.source as DealTimelineSource,
      actionSummary: r.action_summary,
      actorKind: r.actor_kind as DealTimelineActorKind,
      actorUserId: r.actor_user_id,
      actorName: r.actor_user_id ? nameByUserId.get(r.actor_user_id) ?? null : null,
      status: r.status as DealTimelineStatus,
      createdAt: r.created_at,
      triggerType: r.trigger_type,
      actionType: r.action_type,
      channel: r.channel,
      errorMessage: r.error_message,
      undoToken: r.undo_token,
      undoneAt: r.undone_at,
      metadata: r.metadata,
    }));
  } catch {
    return [];
  }
}
