/**
 * Core types for the pipeline trigger primitive registry.
 *
 * Phase 3a of the Custom Pipelines project (docs/reference/custom-pipelines-design.md §7, §11).
 * These types describe the shape of a trigger primitive; two consumers plug into the
 * same registry: pipeline stage triggers (this doc) and Follow-Up Engine cadence steps.
 * Phase 3a ships the registry skeleton only — no dispatcher, no DB writes, no runtime behavior.
 */

import type { z } from 'zod';

export type TriggerTier = 'internal' | 'outbound';

/**
 * Drives the UX gate for a primitive. Outbound primitives touch external parties
 * (invoices, emails, handoff wizard) and default to requires_confirmation = true
 * on the stage; internal primitives (in-app notifications, tasks, field writes)
 * fire silently with a 15s undo toast.
 */
export type TriggerContext =
  | {
      source: 'stage_trigger';
      transitionId: string;
      dealId: string;
      workspaceId: string;
      actorUserId: string | null;
      actorKind: 'user' | 'webhook' | 'system' | 'aion';
    }
  | {
      /**
       * Cadence-step callsite stub for the Follow-Up Engine (§11.2). Shape is
       * provisional — the engine owns the final field set when it lands.
       */
      source: 'cadence_step';
      cadenceRunId: string;
      dealId: string;
      workspaceId: string;
    };

export type TriggerResult =
  | {
      ok: true;
      summary: string;
      /**
       * Opaque handle the undo-toast passes back to `primitive.undo` to reverse
       * the side-effect. Only outbound primitives populate it; internal
       * primitives may leave it undefined.
       */
      undoToken?: string;
    }
  | {
      ok: false;
      error: string;
      retryable: boolean;
    };

export interface TriggerPrimitive<Config> {
  type: string;
  tier: TriggerTier;
  label: string;
  description: string;
  configSchema: z.ZodType<Config>;
  /**
   * Execute the primitive's side-effect.
   *
   * **Idempotency is required.** The Phase 3c dispatcher delivers
   * at-least-once: `ops.claim_pending_transitions` uses `FOR UPDATE SKIP
   * LOCKED`, but the row lock releases at claim-RPC commit — well before
   * `mark_transition_dispatched` stamps the row. A crashed or overlapping
   * cron tick can re-claim the same transition and call `run` again with
   * the same `ctx.transitionId`. Implementations MUST short-circuit on
   * work that has already been applied. Acceptable strategies:
   *
   *   1. Check the target artifact's existence before creating it
   *      (e.g. "does this deal already have an `ops.events` row?",
   *       "does this proposal already have a deposit invoice?").
   *   2. Dedup on `(ctx.dealId, primitive.type, ctx.transitionId)` against
   *      `ops.deal_activity_log` or a per-primitive dedup key before
   *      emitting the side-effect.
   *   3. Delegate to a downstream RPC that is itself idempotent
   *      (e.g. `finance.spawn_invoices_from_proposal`).
   *
   * Returning `ok: true` from a second invocation that found the work
   * already done is correct — the activity log will record one
   * "applied" and one "no-op" entry, not duplicate side-effects.
   */
  run: (config: Config, ctx: TriggerContext) => Promise<TriggerResult>;
  undo?: (undoToken: string, ctx: TriggerContext) => Promise<TriggerResult>;
  /**
   * Return a human-readable sentence describing what this primitive will do
   * with the given config. Used by the confirmation modal to show side-effects
   * before the user commits a stage change.
   *
   * MUST be synchronous and pure — no DB fetches, no network. If the primitive
   * needs runtime context (e.g. which contact will be emailed), the preview
   * can describe the shape without binding ("Send deposit invoice to the
   * deal's main contact"). Runtime binding happens in run().
   */
  preview?: (config: Config) => string;
}
