import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({
  title: z.string(),
  assignee_rule: z.enum(['owner', 'deal_rep', 'crew_chief']),
});

type Config = z.infer<typeof configSchema>;

/**
 * Idempotency (see TriggerPrimitive.run): the dispatcher is at-least-once,
 * so the real implementation MUST dedup on
 * (ctx.dealId, 'create_task', ctx.transitionId) before inserting — either
 * via a unique index on the dedup tuple (preferred) or by looking up an
 * existing task row tagged with ctx.transitionId and returning ok:true
 * without creating a duplicate. The stub has no side-effect so is
 * trivially idempotent today.
 */
export const createTaskPrimitive: TriggerPrimitive<Config> = {
  type: 'create_task',
  tier: 'internal',
  label: 'Create task',
  description:
    'Creates a task in the workspace task list tied to the deal, assigned by the selected rule.',
  configSchema,
  async run(_config, ctx) {
    return {
      ok: true,
      summary: `create_task stub fired for deal ${ctx.dealId}`,
    };
  },
  preview(config) {
    const assignee = config.assignee_rule.replace('_', ' ');
    return `Create a task: "${config.title}" assigned to the ${assignee}.`;
  },
};
