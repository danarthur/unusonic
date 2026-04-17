import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({
  role_slug: z.string(),
  message: z.string().optional(),
});

type Config = z.infer<typeof configSchema>;

/**
 * Idempotency (see TriggerPrimitive.run): the dispatcher is at-least-once,
 * so the real implementation MUST dedup on
 * (ctx.workspaceId, ctx.dealId, 'notify_role', ctx.transitionId) against
 * the notification insert before fanning out — otherwise a re-claimed
 * transition re-pings every matching member. Attach the same dedup key to
 * each row so a UNIQUE constraint (or `INSERT ... ON CONFLICT DO NOTHING`)
 * collapses the second run into a no-op. The stub has no side-effect so is
 * trivially idempotent today.
 */
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
  preview(config) {
    const suffix = config.message ? `: "${config.message}"` : '';
    return `Notify ${config.role_slug} in this workspace${suffix}.`;
  },
};
