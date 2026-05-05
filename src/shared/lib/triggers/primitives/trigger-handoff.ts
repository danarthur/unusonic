import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({});

type Config = z.infer<typeof configSchema>;

/**
 * Idempotency (see TriggerPrimitive.run): the dispatcher is at-least-once, so
 * this primitive MUST check whether the deal has already been handed off
 * before opening/surfacing the wizard. Real implementation will query
 * `ops.events` for a row with `deal_id = ctx.dealId` (handoverDeal writes
 * this linkage in src/app/(dashboard)/(features)/events/actions/handover-deal.ts)
 * and short-circuit with ok:true if one exists. The stub has no side-effect
 * so is trivially idempotent today.
 */
export const triggerHandoffPrimitive: TriggerPrimitive<Config> = {
  type: 'trigger_handoff',
  tier: 'outbound',
  label: 'Open handoff wizard',
  description:
    'Opens the deal-to-event handoff wizard for the user who moved the deal. For webhook-initiated transitions, surfaces a handoff-ready action card on the deal.',
  configSchema,
  async run(_config, ctx) {
    return {
      ok: true,
      summary: `trigger_handoff stub fired for deal ${ctx.dealId}`,
    };
  },
  preview() {
    return 'Open the deal-to-event handoff wizard for this deal.';
  },
};
