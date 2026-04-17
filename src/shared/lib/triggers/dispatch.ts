/**
 * Trigger dispatcher — asynchronous Phase 3c.
 *
 * Reads from `ops.deal_transitions` via the service-role claim RPC, runs each
 * target stage's configured trigger primitives, and writes the result to
 * `ops.deal_activity_log`. Invoked once per minute by
 * `/api/cron/dispatch-triggers`.
 *
 * Design constraints (docs/reference/custom-pipelines-design.md §7, §10):
 *   • Trigger failure MUST NOT block the stage change. Since the stage change
 *     has already committed by the time this module runs, this is structurally
 *     guaranteed. The module further guards against in-loop throws so a single
 *     misbehaving primitive can't wedge the batch.
 *   • Exactly-once via two guards, not just the row-lock: (1) `FOR UPDATE SKIP
 *     LOCKED` in `claim_pending_transitions` disjoints concurrent claim
 *     batches within a single RPC call; (2) `mark_transition_dispatched` /
 *     `mark_transition_failed` both re-check `triggers_dispatched_at IS NULL
 *     AND triggers_failed_at IS NULL` and raise if a row was already stamped.
 *     The mark guard is the structural backstop if a row is somehow re-claimed
 *     after the claim transaction commits — the row lock is released at that
 *     point. Re-invocation on a failed batch just re-claims.
 *   • Dedup (§7.5): 5s bounce window. Computed by the claim RPC; the
 *     dispatcher consumes the row + emits a 'pending' activity entry.
 *
 * @module shared/lib/triggers/dispatch
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSystemClient } from '@/shared/api/supabase/system';
import type { Database, Json } from '@/types/supabase';

// Importing from './registry' triggers the 5 built-in primitives' module-load
// registrations (see registry.ts — the registerPrimitive calls live there).
import { getPrimitive } from './registry';
import type { TriggerContext } from './types';

type SystemClient = SupabaseClient<Database>;

/**
 * Return shape of each row from `ops.claim_pending_transitions(...)`.
 * Derived from the generated RPC return type. Some fields are nullable in the
 * underlying table (actor_user_id, from_stage_id) but the Supabase type
 * generator emits them as non-null on SETOF returns — narrow manually.
 */
export type ClaimedTransitionRow =
  Database['ops']['Functions']['claim_pending_transitions']['Returns'][number];

export interface DispatchSummary {
  /** How many rows the claim RPC returned. */
  claimed: number;
  /** Rows we finished processing (dispatched or failed — i.e. consumed). */
  processed: number;
  /** Rows with an empty triggers array — auto-dispatched as no-ops. */
  no_trigger: number;
  /** Rows where 5s bounce-dedup applied. Dispatched without running primitives. */
  dedup_skipped: number;
  /** Count of individual trigger primitive runs that returned ok:true. */
  success_triggers: number;
  /** Count of primitive failures (unknown type, config error, run threw, ok:false). */
  failed_triggers: number;
}

/**
 * Stage-trigger entries stored on `ops.pipeline_stages.triggers`. Phase 3e
 * introduces the UI to populate these. Today they're empty for every stage.
 */
type StageTrigger = { type: string; config?: Record<string, unknown> };

function parseStageTriggers(raw: Json | null | undefined): StageTrigger[] {
  if (!raw || !Array.isArray(raw)) return [];
  const out: StageTrigger[] = [];
  for (const entry of raw) {
    if (entry && typeof entry === 'object' && !Array.isArray(entry) && typeof (entry as { type?: unknown }).type === 'string') {
      const e = entry as { type: string; config?: unknown };
      out.push({
        type: e.type,
        config: e.config && typeof e.config === 'object' && !Array.isArray(e.config)
          ? (e.config as Record<string, unknown>)
          : {},
      });
    }
  }
  return out;
}

function asActorKind(value: string): 'user' | 'webhook' | 'system' | 'aion' {
  return value === 'user' || value === 'webhook' || value === 'aion' ? value : 'system';
}

async function logActivity(
  db: SystemClient,
  args: {
    dealId: string;
    actorKind: string;
    actorUserId: string | null;
    pipelineStageId: string | null;
    actionSummary: string;
    status: 'success' | 'failed' | 'pending' | 'undone';
    triggerType?: string | null;
    errorMessage?: string | null;
    undoToken?: string | null;
    metadata?: Record<string, unknown>;
  },
): Promise<void> {
  // ops.* RPCs aren't in the exposed PostgREST schema list; use .schema('ops')
  // to route through the ops schema explicitly.
  const { error } = await db.schema('ops').rpc('log_deal_activity', {
    p_deal_id: args.dealId,
    p_actor_kind: args.actorKind,
    p_action_summary: args.actionSummary,
    p_status: args.status,
    p_pipeline_stage_id: args.pipelineStageId ?? undefined,
    p_actor_user_id: args.actorUserId ?? undefined,
    p_trigger_type: args.triggerType ?? undefined,
    p_error_message: args.errorMessage ?? undefined,
    p_metadata: (args.metadata ?? {}) as Json,
    p_undo_token: args.undoToken ?? undefined,
  });
  if (error) {
    // Failing to log is not fatal to the dispatcher — swallow and log to
    // stdout so the row still gets stamped dispatched/failed. A permanently
    // broken log RPC would otherwise wedge the queue.
    console.error('[triggers/dispatch] log_deal_activity failed:', error);
  }
}

async function runTriggersForRow(
  db: SystemClient,
  row: ClaimedTransitionRow,
  triggers: StageTrigger[],
  summary: DispatchSummary,
): Promise<void> {
  const actorUserId = row.actor_user_id && row.actor_user_id.length > 0 ? row.actor_user_id : null;
  const ctxBase: TriggerContext = {
    source: 'stage_trigger',
    transitionId: row.transition_id,
    dealId: row.deal_id,
    workspaceId: row.workspace_id,
    actorUserId,
    actorKind: asActorKind(row.actor_kind),
  };

  // Build the common activity-log args for this row once; per-trigger calls
  // only need to vary action_summary, status, trigger_type, error, undo_token.
  const logBase = {
    dealId: row.deal_id,
    actorKind: row.actor_kind,
    actorUserId,
    pipelineStageId: row.to_stage_id,
  };

  for (const trigger of triggers) {
    const primitive = getPrimitive(trigger.type);
    if (!primitive) {
      summary.failed_triggers++;
      await logActivity(db, {
        ...logBase,
        actionSummary: `Unknown trigger type: ${trigger.type}`,
        status: 'failed',
        triggerType: trigger.type,
        errorMessage: `Unknown trigger type: ${trigger.type}`,
      });
      continue;
    }

    let parsedConfig: unknown;
    try {
      parsedConfig = primitive.configSchema.parse(trigger.config ?? {});
    } catch (err) {
      summary.failed_triggers++;
      await logActivity(db, {
        ...logBase,
        actionSummary: `Invalid config for ${trigger.type}`,
        status: 'failed',
        triggerType: trigger.type,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
      continue;
    }

    try {
      const result = await primitive.run(parsedConfig, ctxBase);
      if (result.ok) {
        summary.success_triggers++;
        await logActivity(db, {
          ...logBase,
          actionSummary: result.summary,
          status: 'success',
          triggerType: trigger.type,
          undoToken: result.undoToken ?? null,
        });
      } else {
        summary.failed_triggers++;
        await logActivity(db, {
          ...logBase,
          actionSummary: `${trigger.type} failed`,
          status: 'failed',
          triggerType: trigger.type,
          errorMessage: result.error,
        });
      }
    } catch (err) {
      summary.failed_triggers++;
      await logActivity(db, {
        ...logBase,
        actionSummary: `${trigger.type} threw`,
        status: 'failed',
        triggerType: trigger.type,
        errorMessage: err instanceof Error ? err.message : String(err),
      });
    }
  }
}

export async function dispatchPendingTransitions(
  db: SystemClient = getSystemClient(),
): Promise<DispatchSummary> {
  const summary: DispatchSummary = {
    claimed: 0,
    processed: 0,
    no_trigger: 0,
    dedup_skipped: 0,
    success_triggers: 0,
    failed_triggers: 0,
  };

  const { data, error } = await db.schema('ops').rpc('claim_pending_transitions', { p_batch_size: 50 });
  if (error) {
    // Claim RPC failed outright — no rows claimed, nothing to stamp. Next
    // tick retries.
    throw error;
  }

  const rows = (data ?? []) as ClaimedTransitionRow[];
  summary.claimed = rows.length;

  for (const row of rows) {
    try {
      const triggers = parseStageTriggers(row.stage_triggers);

      if (row.dedup_skip) {
        summary.dedup_skipped++;
        await logActivity(db, {
          dealId: row.deal_id,
          actorKind: row.actor_kind,
          actorUserId: row.actor_user_id && row.actor_user_id.length > 0 ? row.actor_user_id : null,
          pipelineStageId: row.to_stage_id,
          actionSummary: 'Skipped: deal re-entered this stage within 5s',
          status: 'pending',
          triggerType: null,
          metadata: { reason: 'dedup_bounce_5s' },
        });
      } else if (triggers.length === 0) {
        summary.no_trigger++;
        // No activity log entry — the stage has nothing configured, so there's
        // nothing user-facing to report. Just consume the row.
      } else {
        await runTriggersForRow(db, row, triggers, summary);
      }

      const { error: stampErr } = await db.schema('ops').rpc('mark_transition_dispatched', {
        p_transition_id: row.transition_id,
      });
      if (stampErr) {
        // Couldn't stamp dispatched — mark failed so we don't re-run forever.
        console.error('[triggers/dispatch] mark_transition_dispatched failed:', stampErr);
        await db.schema('ops').rpc('mark_transition_failed', {
          p_transition_id: row.transition_id,
          p_error: `stamp_failed: ${stampErr.message}`,
        });
      }
      summary.processed++;
    } catch (err) {
      // Defensive: never throw out of the top-level loop. Mark the row failed
      // so the dispatcher moves on, then continue with the next row.
      console.error('[triggers/dispatch] unexpected error on row', row.transition_id, err);
      try {
        await db.schema('ops').rpc('mark_transition_failed', {
          p_transition_id: row.transition_id,
          p_error: err instanceof Error ? err.message : String(err),
        });
      } catch (innerErr) {
        console.error('[triggers/dispatch] mark_transition_failed also threw:', innerErr);
      }
    }
  }

  return summary;
}
