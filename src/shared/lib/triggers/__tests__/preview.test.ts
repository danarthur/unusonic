/**
 * Phase 3f — primitive preview() tests.
 *
 * Every built-in primitive returns a non-empty human sentence for a minimal
 * valid config. The Prism confirm modal relies on these strings to describe
 * outbound side-effects before the user commits a stage change. If any of
 * these returns undefined or an empty string, the modal silently degrades
 * to just the primitive type — so we guard that here.
 *
 * Also covers the optional-ness of `preview` on the interface: a primitive
 * without `preview` should cleanly return undefined via optional chaining,
 * never throw.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { z } from 'zod';

import {
  __resetRegistryForTests,
  registerPrimitive,
  getPrimitive,
} from '../registry';
import type { TriggerPrimitive } from '../types';

import { triggerHandoffPrimitive } from '../primitives/trigger-handoff';
import { sendDepositInvoicePrimitive } from '../primitives/send-deposit-invoice';
import { notifyRolePrimitive } from '../primitives/notify-role';
import { createTaskPrimitive } from '../primitives/create-task';
import { updateDealFieldPrimitive } from '../primitives/update-deal-field';

describe('primitive preview()', () => {
  it('trigger_handoff returns a handoff wizard sentence', () => {
    const preview = triggerHandoffPrimitive.preview;
    expect(preview).toBeDefined();
    const sentence = preview!({});
    expect(sentence).toMatch(/handoff/i);
    expect(sentence.length).toBeGreaterThan(0);
  });

  it('send_deposit_invoice distinguishes deposit vs balance', () => {
    const preview = sendDepositInvoicePrimitive.preview;
    expect(preview).toBeDefined();

    const depositSentence = preview!({ amount_basis: 'deposit' });
    expect(depositSentence).toMatch(/deposit/i);
    expect(depositSentence).not.toMatch(/balance/i);

    const balanceSentence = preview!({ amount_basis: 'balance' });
    expect(balanceSentence).toMatch(/balance/i);
  });

  it('notify_role includes the role slug and an optional message', () => {
    const preview = notifyRolePrimitive.preview;
    expect(preview).toBeDefined();

    const bare = preview!({ role_slug: 'owner' });
    expect(bare).toMatch(/owner/);
    expect(bare).not.toMatch(/":/); // no empty message suffix

    const withMessage = preview!({ role_slug: 'crew_chief', message: 'heads up' });
    expect(withMessage).toMatch(/crew_chief/);
    expect(withMessage).toMatch(/heads up/);
  });

  it('create_task humanizes the assignee rule and quotes the title', () => {
    const preview = createTaskPrimitive.preview;
    expect(preview).toBeDefined();

    const sentence = preview!({ title: 'Confirm deposit', assignee_rule: 'deal_rep' });
    expect(sentence).toMatch(/"Confirm deposit"/);
    expect(sentence).toMatch(/deal rep/); // underscore humanized
    expect(sentence).not.toMatch(/deal_rep/);
  });

  it('update_deal_field stringifies the target value', () => {
    const preview = updateDealFieldPrimitive.preview;
    expect(preview).toBeDefined();

    const sentence = preview!({ field: 'won_at', value: '2026-04-16' });
    expect(sentence).toMatch(/won_at/);
    expect(sentence).toMatch(/"2026-04-16"/);

    const nullSentence = preview!({ field: 'close_date', value: null });
    expect(nullSentence).toMatch(/null/);
  });

  describe('preview is optional on the interface', () => {
    beforeEach(() => {
      __resetRegistryForTests();
    });

    it('optional chaining on a primitive without preview returns undefined', () => {
      const bare: TriggerPrimitive<{ n: number }> = {
        type: 'bare_for_preview_test',
        tier: 'internal',
        label: 'bare',
        description: 'primitive intentionally lacking preview',
        configSchema: z.object({ n: z.number() }),
        async run(_config, ctx) {
          return { ok: true, summary: `bare fired for ${ctx.dealId}` };
        },
      };
      registerPrimitive(bare);

      const result = getPrimitive('bare_for_preview_test')?.preview?.({ n: 1 });
      expect(result).toBeUndefined();
    });
  });
});
