/**
 * Dwell-SLA dispatcher.
 *
 * Complements the on-enter dispatcher (`./dispatch.ts`). Where that one
 * reads `ops.deal_transitions` and fires `event='on_enter'` primitives at
 * stage change time, this reads the output of `ops.evaluate_dwell_sla(...)`
 * — a SQL function that returns deals whose current stage has a
 * `event='dwell_sla'` trigger past its `dwell_days` threshold and has not
 * yet been enrolled.
 *
 * Idempotency is carried by the same `(originating_transition_id,
 * primitive_key)` unique index used by on-enter `enroll_in_follow_up`
 * insertions. The SLA dispatcher synthesizes primitive keys prefixed `sla:`
 * so they don't collide with on-enter keys for the same trigger.
 *
 * Runs hourly via `/api/cron/dwell-sla` (see `vercel.json`). Cheaper than
 * per-minute because SLA windows are measured in days.
 */

import 'server-only';

import type { SupabaseClient } from '@supabase/supabase-js';

import { getSystemClient } from '@/shared/api/supabase/system';
import type { Database, Json } from '@/types/supabase';
import { getPrimitive } from './registry';
import type { TriggerContext } from './types';

type SystemClient = SupabaseClient<Database>;

export interface DwellSlaSummary {
  /** Rows returned by evaluate_dwell_sla. */
  evaluated: number;
  /** Primitives that returned ok:true (including deduped no-ops). */
  success: number;
  /** Primitives that returned ok:false or threw. */
  failed: number;
}

type SlaEvaluationRow = {
  transition_id: string;
  workspace_id: string;
  deal_id: string;
  pipeline_id: string;
  to_stage_id: string;
  stage_tags: string[] | null;
  trigger_payload: Json;
};

type TriggerPayload = {
  type: string;
  event?: string;
  dwell_days?: number;
  primitive_key?: string;
  config?: Record<string, unknown>;
};

function parseTriggerPayload(raw: Json | null): TriggerPayload | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.type !== 'string') return null;
  return {
    type: r.type,
    event: typeof r.event === 'string' ? r.event : undefined,
    dwell_days: typeof r.dwell_days === 'number' ? r.dwell_days : undefined,
    primitive_key: typeof r.primitive_key === 'string' ? r.primitive_key : undefined,
    config:
      r.config && typeof r.config === 'object' && !Array.isArray(r.config)
        ? (r.config as Record<string, unknown>)
        : {},
  };
}

export async function dispatchDwellSla(
  db: SystemClient = getSystemClient(),
): Promise<DwellSlaSummary> {
  const summary: DwellSlaSummary = { evaluated: 0, success: 0, failed: 0 };

  // `evaluate_dwell_sla` RPC ships in migration 20260423000200; generated
  // types are stale until `npm run db:types` runs post-deploy. Route through
  // `any` — same pattern the custom-pipelines dispatcher already uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stale types
  const { data, error } = await (db.schema('ops') as any).rpc('evaluate_dwell_sla', {
    p_batch_size: 100,
  });
  if (error) throw error;

  const rows = (data ?? []) as SlaEvaluationRow[];
  summary.evaluated = rows.length;

  for (const row of rows) {
    const trigger = parseTriggerPayload(row.trigger_payload);
    if (!trigger) {
      summary.failed++;
      continue;
    }

    const primitive = getPrimitive(trigger.type);
    if (!primitive) {
      summary.failed++;
      continue;
    }

    // Primitive keys synthesized from the stage trigger's key with an
    // "sla:" prefix so dedup never collides with on_enter rows written by
    // the same trigger on a prior transition into the same stage.
    const basePrimitiveKey = trigger.primitive_key ?? `${trigger.type}:${trigger.event ?? 'dwell_sla'}`;
    const slaPrimitiveKey = `sla:${basePrimitiveKey}`;

    let parsedConfig: unknown;
    try {
      parsedConfig = primitive.configSchema.parse(trigger.config ?? {});
    } catch {
      summary.failed++;
      continue;
    }

    const ctx: TriggerContext = {
      source: 'stage_trigger',
      transitionId: row.transition_id,
      dealId: row.deal_id,
      workspaceId: row.workspace_id,
      actorUserId: null,
      actorKind: 'system',
      primitiveKey: slaPrimitiveKey,
      event: 'dwell_sla',
      stageTags: row.stage_tags ?? undefined,
    };

    try {
      const result = await primitive.run(parsedConfig, ctx);
      if (result.ok) summary.success++;
      else summary.failed++;
    } catch (err) {
      console.error('[dwell-sla] primitive threw:', err);
      summary.failed++;
    }
  }

  return summary;
}
