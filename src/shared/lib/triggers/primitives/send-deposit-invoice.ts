import { z } from 'zod';
import type { TriggerPrimitive } from '../types';

const configSchema = z.object({
  amount_basis: z.enum(['deposit', 'balance']).default('deposit'),
});

type Config = z.infer<typeof configSchema>;

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
};
