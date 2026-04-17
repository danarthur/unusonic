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
  run: (config: Config, ctx: TriggerContext) => Promise<TriggerResult>;
  undo?: (undoToken: string, ctx: TriggerContext) => Promise<TriggerResult>;
}
