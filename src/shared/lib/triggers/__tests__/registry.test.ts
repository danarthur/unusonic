import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';
import {
  registerPrimitive,
  getPrimitive,
  listAllPrimitives,
  listByTier,
  __resetRegistryForTests,
} from '../registry';
import { notifyRolePrimitive } from '../primitives/notify-role';
import type { TriggerContext, TriggerPrimitive } from '../types';

const stageCtx: TriggerContext = {
  source: 'stage_trigger',
  transitionId: 't1',
  dealId: 'deal-123',
  workspaceId: 'ws-1',
  actorUserId: 'user-1',
  actorKind: 'user',
};

const buildFakePrimitive = (type: string): TriggerPrimitive<{ n: number }> => ({
  type,
  tier: 'internal',
  label: `fake ${type}`,
  description: 'fake primitive for testing',
  configSchema: z.object({ n: z.number() }),
  async run(_config, ctx) {
    return { ok: true, summary: `fake ${type} fired for deal ${ctx.dealId}` };
  },
});

describe('trigger registry', () => {
  describe('auto-registration on module load', () => {
    it('populates all 5 catalog primitives', () => {
      const all = listAllPrimitives();
      const types = all.map((p) => p.type).sort();
      expect(types).toEqual([
        'create_task',
        'notify_role',
        'send_deposit_invoice',
        'trigger_handoff',
        'update_deal_field',
      ]);
    });

    it('splits the catalog into 3 internal + 2 outbound per §7.3', () => {
      expect(listByTier('internal').map((p) => p.type).sort()).toEqual([
        'create_task',
        'notify_role',
        'update_deal_field',
      ]);
      expect(listByTier('outbound').map((p) => p.type).sort()).toEqual([
        'send_deposit_invoice',
        'trigger_handoff',
      ]);
    });
  });

  describe('retrieval and registration (isolated state)', () => {
    beforeEach(() => {
      __resetRegistryForTests();
    });

    it('registers and retrieves a primitive by type', () => {
      const fake = buildFakePrimitive('fake_1');
      registerPrimitive(fake);
      expect(getPrimitive('fake_1')?.type).toBe('fake_1');
      expect(getPrimitive('nonexistent')).toBeUndefined();
    });

    it('throws when the same type is registered twice', () => {
      registerPrimitive(buildFakePrimitive('dup'));
      expect(() => registerPrimitive(buildFakePrimitive('dup'))).toThrow(
        /already registered/,
      );
    });
  });

  describe('primitive config schemas', () => {
    it('validates a good notify_role config and rejects a bad one', () => {
      const good = notifyRolePrimitive.configSchema.safeParse({
        role_slug: 'crew_chief',
        message: 'heads up',
      });
      expect(good.success).toBe(true);

      const bad = notifyRolePrimitive.configSchema.safeParse({
        role_slug: 123,
      });
      expect(bad.success).toBe(false);
    });
  });

  describe('primitive run() stubs', () => {
    it('notify_role.run returns ok with the expected summary shape', async () => {
      const result = await notifyRolePrimitive.run(
        { role_slug: 'owner' },
        stageCtx,
      );
      expect(result).toEqual({
        ok: true,
        summary: 'notify_role stub fired for deal deal-123',
      });
    });
  });
});
