import { z } from 'zod';

import { getSystemClient } from '@/shared/api/supabase/system';
import {
  StageTriggerConfigSchema,
  type FollowUpReasonType,
  type TriggerChannel,
} from '@/shared/lib/triggers/schema';
import { resolveReasonCopy } from '@/shared/lib/follow-up-copy';
import type { TriggerPrimitive } from '../types';

/**
 * `enroll_in_follow_up` — writes a row into `ops.follow_up_queue` scoped to
 * the deal's current transition. The primitive is the glue that makes pipeline
 * stage transitions first-class signals for the follow-up engine.
 *
 * ## Idempotency
 *
 * The dispatcher is at-least-once (see `../dispatch.ts` header). A crashed or
 * overlapping cron tick CAN re-invoke this primitive with the same
 * `ctx.transitionId`. Two defenses:
 *
 *   1. DB-level: a partial UNIQUE index
 *        `(originating_transition_id, primitive_key)`
 *      covers all statuses (pending, acted, snoozed, dismissed). Migration
 *      `20260423000000_follow_up_p0_schema.sql` creates it.
 *
 *   2. Insert guard: the primitive uses `INSERT ... ON CONFLICT DO NOTHING`
 *      on that index, so a re-run is a no-op and returns `ok: true`
 *      without surfacing the conflict.
 *
 * ## Channel precedence
 *
 * Channel resolver reads the deal's client/host entity's aion_memory (scope
 * 'episodic', fact prefix `channel:`), takes the most-recent entry, then
 * falls back to the trigger's `config.channel`, then to `'email'`. Never
 * prompts the owner — if neither is set, the fallback stands.
 *
 * ## Priority
 *
 * Base = 10 (a neutral floor so triggered follow-ups surface above quiet
 * deals with no computed score). `priority_boost` adds on top. Ceiling is
 * 100 by default (column default on follow_up_queue.priority_ceiling).
 */

const configSchema = StageTriggerConfigSchema.refine(
  (c) => typeof c.reason_type === 'string',
  { message: 'enroll_in_follow_up requires config.reason_type' },
);

type Config = z.infer<typeof configSchema>;

const BASE_PRIORITY = 10;

/**
 * Resolve the suggested channel for a deal's follow-up. Channel precedence
 * (critic review §H2):
 *   1. Entity aion_memory fact prefixed `channel:` on the deal's client
 *      organization, most recent wins. Valid facts: `channel:email`,
 *      `channel:sms`, `channel:phone`.
 *   2. Trigger config's `channel` field.
 *   3. Hard fallback: 'email'.
 */
async function resolveChannel(
  dealId: string,
  workspaceId: string,
  configChannel: TriggerChannel | undefined,
): Promise<TriggerChannel> {
  const system = getSystemClient();

  // Read the deal's organization_id via the public.deals view (service role
  // client; RLS bypassed). Any NULL org_id early-outs to the config fallback.
  const { data: dealRow } = await system
    .from('deals')
    .select('organization_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const orgId = (dealRow as { organization_id?: string | null } | null)?.organization_id ?? null;

  if (orgId) {
    const { data: prefs } = await (system as unknown as ReturnType<typeof getSystemClient>)
      .schema('cortex')
      .from('aion_memory')
      .select('fact, updated_at')
      .eq('entity_id', orgId)
      .eq('scope', 'episodic')
      .ilike('fact', 'channel:%')
      .order('updated_at', { ascending: false })
      .limit(1);

    const topFact = (prefs as { fact: string }[] | null | undefined)?.[0]?.fact ?? null;
    if (topFact) {
      const suffix = topFact.slice('channel:'.length).toLowerCase().trim();
      if (suffix === 'email' || suffix === 'sms' || suffix === 'phone') {
        return suffix;
      }
    }
  }

  return configChannel ?? 'email';
}

export const enrollInFollowUpPrimitive: TriggerPrimitive<Config> = {
  type: 'enroll_in_follow_up',
  tier: 'internal',
  label: 'Enroll in follow-up queue',
  description:
    'Enrolls the deal in the follow-up queue with a typed reason. Owner sees it in the Today widget (internal) or the deal surface (client-visible if hide_from_portal is false).',
  configSchema,

  async run(rawConfig, ctx) {
    // This primitive only runs from stage transitions — cadence_step isn't a
    // live callsite yet. Narrow to the stage_trigger variant so the compiler
    // (and future readers) can see which context fields are available.
    if (ctx.source !== 'stage_trigger') {
      return {
        ok: false,
        error: 'enroll_in_follow_up requires a stage_trigger context',
        retryable: false,
      };
    }

    const config = rawConfig as Config;
    const reasonType = config.reason_type as FollowUpReasonType;
    const { label: reasonLabel } = resolveReasonCopy(reasonType);
    const channel = await resolveChannel(ctx.dealId, ctx.workspaceId, config.channel);
    const priorityBoost = typeof config.priority_boost === 'number' ? config.priority_boost : 0;
    const hideFromPortal = typeof config.hide_from_portal === 'boolean' ? config.hide_from_portal : true;

    // primitive_key either comes from the trigger definition (preferred — a
    // stable admin-authored identifier) or is synthesized from reason_type
    // so that dedup still works for hand-authored triggers that forgot the
    // key.
    const primitiveKey = ctx.primitiveKey ?? `auto:${reasonType}`;

    const system = getSystemClient();

    // New columns (originating_transition_id, primitive_key, hide_from_portal)
    // arrive with migration 20260423000000; generated Supabase types are stale
    // until `npm run db:types` runs post-deploy. Cast through `any` for this
    // insert path — matches how other ops.* writers handle the lag.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- stale types
    const opsDb = system.schema('ops') as any;

    const { error } = await opsDb
      .from('follow_up_queue')
      .insert({
        workspace_id: ctx.workspaceId,
        deal_id: ctx.dealId,
        priority_score: BASE_PRIORITY + priorityBoost,
        reason: reasonLabel,
        reason_type: reasonType,
        suggested_channel: channel,
        follow_up_category: reasonType === 'thank_you' ? 'nurture' : 'sales',
        status: 'pending',
        hide_from_portal: hideFromPortal,
        originating_transition_id: ctx.transitionId,
        primitive_key: primitiveKey,
        context_snapshot: {
          triggered_by_transition_id: ctx.transitionId,
          dwell_days: config.dwell_days ?? null,
          priority_boost: priorityBoost,
          source: 'stage_trigger',
        },
      });

    if (error) {
      // Duplicate key = primitive already fired for this transition. Treat as
      // a successful no-op so the dispatcher stamps the transition dispatched
      // and doesn't spin.
      const code = (error as { code?: string }).code;
      const message = error.message ?? '';
      if (code === '23505' || message.includes('follow_up_queue_transition_primitive_uniq') || message.includes('follow_up_queue_deal_reason_pending_uniq')) {
        return {
          ok: true,
          summary: `enroll_in_follow_up deduped: ${reasonType} already enrolled for this transition`,
        };
      }
      return {
        ok: false,
        error: `enroll_in_follow_up insert failed: ${message}`,
        retryable: true,
      };
    }

    return {
      ok: true,
      summary: `Enrolled follow-up (${reasonType}) for deal ${ctx.dealId}`,
    };
  },

  preview(config) {
    const reasonType = (config.reason_type as FollowUpReasonType | undefined) ?? 'nudge_client';
    const { label } = resolveReasonCopy(reasonType);
    const dwell = typeof config.dwell_days === 'number' ? `after ${config.dwell_days} day${config.dwell_days === 1 ? '' : 's'}` : '';
    return `Enroll a follow-up: "${label}"${dwell ? ' ' + dwell : ''}.`.replace(/\s+/g, ' ').trim();
  },
};
