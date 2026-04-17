import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({
  role_slug: z.string(),
  message: z.string().optional(),
});

type Config = z.infer<typeof configSchema>;

export const notifyRolePrimitive: TriggerPrimitive<Config> = {
  type: 'notify_role',
  tier: 'internal',
  label: 'Notify role',
  description:
    'Sends an in-app notification to every workspace member who holds the given role.',
  configSchema,
  async run(_config, ctx) {
    return {
      ok: true,
      summary: `notify_role stub fired for deal ${ctx.dealId}`,
    };
  },
};
