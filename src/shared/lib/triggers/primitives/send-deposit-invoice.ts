import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({
  amount_basis: z.enum(['deposit', 'balance']).default('deposit'),
});

type Config = z.infer<typeof configSchema>;

/**
 * Idempotency (see TriggerPrimitive.run): satisfied by delegating to
 * `finance.spawn_invoices_from_proposal`, which is itself idempotent
 * (see CLAUDE.md: "idempotent invoice generation from accepted proposal").
 * A second call with the same proposal returns the already-spawned invoice
 * IDs rather than creating duplicates. The send-email step must additionally
 * dedup on (invoice_id, 'initial_send') against the finance send log before
 * re-sending. The stub has no side-effect so is trivially idempotent today.
 */
export const sendDepositInvoicePrimitive: TriggerPrimitive<Config> = {
  type: 'send_deposit_invoice',
  tier: 'outbound',
  label: 'Send deposit invoice',
  description:
    "Auto-generates an invoice from the deal's accepted proposal via finance.spawn_invoices_from_proposal and sends it to the client.",
  configSchema,
  async run(_config, ctx) {
    return {
      ok: true,
      summary: `send_deposit_invoice stub fired for deal ${ctx.dealId}`,
    };
  },
  preview(config) {
    const kind = config.amount_basis === 'balance' ? 'full balance' : 'deposit';
    return `Generate and send a ${kind} invoice to the client.`;
  },
};
