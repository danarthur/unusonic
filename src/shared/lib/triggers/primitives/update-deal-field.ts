import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({
  field: z.string(),
  value: z.unknown(),
});

type Config = z.infer<typeof configSchema>;

/**
 * Idempotency (see TriggerPrimitive.run): satisfied by construction — an
 * UPDATE that writes the same value a second time is a no-op at the row
 * level. The real implementation should still guard against overwriting a
 * user's subsequent edit (e.g. don't clobber a manually-set won_at with a
 * now() stamped by a re-claimed transition): use `UPDATE ... WHERE field
 * IS DISTINCT FROM :value` or check-before-write against ctx.transitionId
 * ordering. The stub has no side-effect so is trivially idempotent today.
 */
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
