import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({});

type Config = z.infer<typeof configSchema>;

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
};
