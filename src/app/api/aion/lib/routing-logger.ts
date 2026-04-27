/**
 * Aion Routing Decision Logger
 *
 * Logs every routing decision for analysis. Without this data, all routing
 * threshold tuning is guesswork.
 *
 * Wk 13: each turn's outcome is mirrored to ops.aion_events
 * (event_type='aion.turn_complete') alongside the structured Vercel log,
 * so the §3.10 admin metrics can aggregate over real persisted data.
 * Decision-time signal stays log-only — the kill-metric and routing-tuning
 * queries only need the outcome row.
 */

import type { ModelTier, Intent } from './models';
import { recordAionEvent } from './event-logger';

export type RoutingDecision = {
  /** Selected model tier */
  tier: ModelTier;
  /** Classified intent */
  intent: Intent;
  /** User message length */
  messageLength: number;
  /** Conversation depth */
  messageCount: number;
  /** Page the user was on */
  pageType: string | null;
  /** User's role */
  userRole: string;
  /** Whether user has write permissions */
  canWrite: boolean;
  /** Workspace ID (for aggregation) */
  workspaceId: string;
  /** User ID — Wk 13 §3.10. Used for per-user aggregations in admin metrics. */
  userId?: string;
  /** Session ID — Wk 13 §3.10. Threads turn rows back to the cortex.aion_sessions row. */
  sessionId?: string;
};

export type RoutingOutcome = {
  /** Tools actually invoked during this turn */
  toolsCalled: string[];
  /** Whether the stream completed without error */
  success: boolean;
  /** Total duration from request to stream close (ms) */
  durationMs: number;
};

/**
 * Log the routing decision at request time.
 * Returns a finalize function to call after the stream completes.
 */
export function logRoutingDecision(decision: RoutingDecision) {
  const startTime = Date.now();

  // Log decision immediately (available even if stream fails)
  console.log(JSON.stringify({
    event: 'aion_route',
    ...decision,
    timestamp: new Date().toISOString(),
  }));

  /** Call this after the stream completes to log the outcome */
  return function logOutcome(outcome: RoutingOutcome) {
    const durationMs = Date.now() - startTime;
    console.log(JSON.stringify({
      event: 'aion_route_outcome',
      tier: decision.tier,
      intent: decision.intent,
      pageType: decision.pageType,
      ...outcome,
      durationMs,
      timestamp: new Date().toISOString(),
    }));

    // Wk 13 §3.10 — persist the outcome to ops.aion_events. Fire-and-forget;
    // failures already log internally to Vercel's pipeline.
    void recordAionEvent({
      eventType: 'aion.turn_complete',
      workspaceId: decision.workspaceId,
      userId: decision.userId ?? null,
      sessionId: decision.sessionId ?? null,
      durationMs,
      payload: {
        tier: decision.tier,
        intent: decision.intent,
        page_type: decision.pageType,
        user_role: decision.userRole,
        can_write: decision.canWrite,
        message_length: decision.messageLength,
        message_count: decision.messageCount,
        tools_called: outcome.toolsCalled,
        success: outcome.success,
      },
    });
  };
}
