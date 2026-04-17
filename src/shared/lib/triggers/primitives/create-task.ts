import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({
  title: z.string(),
  assignee_rule: z.enum(['owner', 'deal_rep', 'crew_chief']),
});

type Config = z.infer<typeof configSchema>;

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
};
