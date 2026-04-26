/**
 * Aion event logger — Phase 3 §3.10 telemetry surface.
 *
 * Single helper that appends a row to ops.aion_events via the service-role
 * client. Use this from any code path that wants to record an Aion event
 * (turn_complete, tool_call, pill_emit, pill_dismiss, pill_click, brief_open,
 * etc.) — keeps the schema reference and the failure-isolation pattern in
 * one place.
 *
 * Telemetry is never load-bearing: the helper never throws, and a write
 * failure is logged but the caller's success path keeps moving. RLS on
 * ops.aion_events allows authenticated callers to SELECT their own rows
 * (workspace-scoped) but writes go through service_role only — no client-
 * facing INSERT policy exists, by design.
 *
 * The grepable Vercel-log mirror is preserved at every callsite so that a
 * production incident in the table layer (RLS drift, connection blip) still
 * leaves a paper trail in the structured log pipeline.
 */

import { getSystemClient } from '@/shared/api/supabase/system';
import type { Json } from '@/types/supabase';

export type AionEventType =
  | 'aion.brief_open'
  | 'aion.turn_complete'
  | 'aion.tool_call'
  | 'aion.pill_emit'
  | 'aion.pill_dismiss'
  | 'aion.pill_click';

export type RecordAionEventInput = {
  /** event_type column. Use the AionEventType union above. */
  eventType: AionEventType;
  /** Workspace scope for the event. Null when the event is cross-workspace
   *  (admin telemetry, system events) — kept nullable so the kill-metric
   *  query can filter NULL rows out as noise. */
  workspaceId?: string | null;
  /** Authenticated user id when applicable. Null for system-fired events. */
  userId?: string | null;
  /** Aion session id when applicable. Null for events not tied to a chat
   *  turn (brief_open, system tasks). */
  sessionId?: string | null;
  /** Event-specific payload. Free-form jsonb; keep it small + boring. */
  payload?: Record<string, unknown>;
  /** Optional duration in milliseconds (turn_complete, tool_call). */
  durationMs?: number | null;
};

export async function recordAionEvent(input: RecordAionEventInput): Promise<void> {
  const system = getSystemClient();
  const { error } = await system
    .schema('ops')
    .from('aion_events')
    .insert({
      workspace_id: input.workspaceId ?? null,
      user_id: input.userId ?? null,
      session_id: input.sessionId ?? null,
      event_type: input.eventType,
      payload: (input.payload ?? {}) as unknown as Json,
      duration_ms: input.durationMs ?? null,
    });

  if (error) {
    // Telemetry must never block. Log structured so Vercel queries surface
    // failures alongside successful events.
    console.log(JSON.stringify({
      event: 'aion_event_log_error',
      eventType: input.eventType,
      workspaceId: input.workspaceId ?? null,
      userId: input.userId ?? null,
      error: error.message,
      timestamp: new Date().toISOString(),
    }));
  }
}
