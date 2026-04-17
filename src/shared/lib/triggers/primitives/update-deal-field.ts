import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({
  field: z.string(),
  value: z.unknown(),
});

type Config = z.infer<typeof configSchema>;

export const updateDealFieldPrimitive: TriggerPrimitive<Config> = {
  type: 'update_deal_field',
  tier: 'internal',
  label: 'Update deal field',
  description:
    'Sets or clears a column on public.deals (e.g. stamp won_at, set close_date).',
  configSchema,
  async run(_config, ctx) {
    return {
      ok: true,
      summary: `update_deal_field stub fired for deal ${ctx.dealId}`,
    };
  },
};
