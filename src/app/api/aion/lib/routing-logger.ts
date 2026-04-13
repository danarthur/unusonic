/**
 * Aion Routing Decision Logger
 *
 * Logs every routing decision for analysis. Without this data,
 * all routing threshold tuning is guesswork.
 *
 * Logged to structured console output (Vercel-queryable).
 * Can be upgraded to a DB table once volume justifies it.
 */

import type { ModelTier } from './models';
import type { Intent } from './models';

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
    console.log(JSON.stringify({
      event: 'aion_route_outcome',
      tier: decision.tier,
      intent: decision.intent,
      pageType: decision.pageType,
      ...outcome,
      durationMs: Date.now() - startTime,
      timestamp: new Date().toISOString(),
    }));
  };
}
