/**
 * Zod schemas for pipeline stage triggers.
 *
 * Used by the `/settings/pipeline` editor server action to validate trigger
 * JSON before write, and by the `enroll_in_follow_up` primitive's config
 * parser. The dispatcher's parser (dispatch.ts#parseStageTriggers) is
 * intentionally more lenient — it must be forward-compatible with trigger
 * shapes that pre-date a schema change. Strict validation only applies on
 * the write path.
 *
 * Size guard: `StageTriggersSchema.max(10)` and a 4KB serialized-config
 * limit are enforced here. See critic review §H3 — these are TOAST-discipline
 * ceilings, not aesthetic ones.
 */

import { z } from 'zod';

/** Channels a follow-up can suggest. Portal-visible threads always fall back
 * to email. */
export const TriggerChannelSchema = z.enum(['email', 'sms', 'phone']);
export type TriggerChannel = z.infer<typeof TriggerChannelSchema>;

/** Reasons a follow-up is enrolled. Aligns with the DB CHECK constraint on
 * `ops.follow_up_queue.reason_type` (see migration 20260423000000). */
export const FollowUpReasonTypeSchema = z.enum([
  'stall',
  'engagement_hot',
  'deadline_proximity',
  'no_owner',
  'no_activity',
  'proposal_unseen',
  'proposal_bounced',
  'proposal_sent',
  'date_hold_pressure',
  'nudge_client',
  'check_in',
  'gone_quiet',
  'thank_you',
]);
export type FollowUpReasonType = z.infer<typeof FollowUpReasonTypeSchema>;

/** Dismissal reasons — maps 1:1 to the DB CHECK on
 * `ops.follow_up_queue.dismissal_reason`. `other` opens the free-text input. */
export const DismissalReasonSchema = z.enum([
  'tire_kicker',
  'wrong_timing',
  'manual_nudge_sent',
  'not_ready',
  'other',
]);
export type DismissalReason = z.infer<typeof DismissalReasonSchema>;

/**
 * Config shared across trigger primitives. `passthrough` so unknown keys
 * survive for primitive-specific configuration without a schema churn.
 */
export const StageTriggerConfigSchema = z
  .object({
    reason_type: FollowUpReasonTypeSchema.optional(),
    dwell_days: z.number().int().positive().optional(),
    channel: TriggerChannelSchema.optional(),
    priority_boost: z.number().int().optional(),
    label: z.string().max(120).optional(),
    title: z.string().max(120).optional(),
    owner: z.enum(['deal_owner', 'workspace_admin']).optional(),
    assignee_rule: z.enum(['owner', 'deal_rep', 'crew_chief']).optional(),
    open_wizard: z.boolean().optional(),
    hide_from_portal: z.boolean().optional(),
  })
  .passthrough();
export type StageTriggerConfig = z.infer<typeof StageTriggerConfigSchema>;

/**
 * One trigger on a stage. `event` distinguishes on_enter (fires on the
 * transition into the stage), dwell_sla (fires when the deal has sat in
 * the stage past dwell_days), and on_exit (fires on the transition out).
 */
export const StageTriggerSchema = z
  .object({
    type: z.enum([
      'trigger_handoff',
      'send_deposit_invoice',
      'notify_role',
      'create_task',
      'update_deal_field',
      'enroll_in_follow_up',
    ]),
    event: z.enum(['on_enter', 'on_exit', 'dwell_sla']).default('on_enter'),
    dwell_days: z.number().int().positive().optional(),
    primitive_key: z.string().min(1).max(60).optional(),
    config: StageTriggerConfigSchema.default({}),
  })
  .refine(
    (t) => t.event !== 'dwell_sla' || (t.dwell_days && t.dwell_days > 0),
    { message: 'dwell_sla triggers require dwell_days > 0' },
  );
export type StageTrigger = z.infer<typeof StageTriggerSchema>;

const MAX_TRIGGERS_PER_STAGE = 10;
/** Total serialized-config budget across all triggers on a stage, in bytes.
 * Stays inline without spilling to TOAST on the claim_pending_transitions
 * hot path (critic §H3). */
const MAX_TOTAL_CONFIG_BYTES = 4096;

/**
 * Array of stage triggers with per-stage size and serialization ceilings.
 * Invoke on the server-action write path before UPDATE ops.pipeline_stages.
 */
export const StageTriggersSchema = z
  .array(StageTriggerSchema)
  .max(MAX_TRIGGERS_PER_STAGE, {
    message: `A stage cannot have more than ${MAX_TRIGGERS_PER_STAGE} triggers.`,
  })
  .refine(
    (triggers) => {
      const size = JSON.stringify(triggers).length;
      return size <= MAX_TOTAL_CONFIG_BYTES;
    },
    {
      message: `Total triggers config exceeds ${MAX_TOTAL_CONFIG_BYTES} bytes.`,
    },
  );

/**
 * Narrow helper the dispatcher's parseStageTriggers can feed into. Non-throwing —
 * returns undefined on parse failure so a malformed trigger doesn't wedge the
 * whole stage's trigger list on the dispatch side. Server writes use the
 * throwing form (StageTriggersSchema.parse).
 */
export function safeParseStageTrigger(raw: unknown): StageTrigger | undefined {
  const result = StageTriggerSchema.safeParse(raw);
  return result.success ? result.data : undefined;
}
