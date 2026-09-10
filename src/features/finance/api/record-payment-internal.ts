/**
 * Payment recording internals — server-only, and deliberately NOT `'use server'`.
 *
 * Everything exported from a 'use server' file becomes a Server Action, which
 * means it is callable by anyone who can reach the app. A service-role write
 * that takes an invoice id and an amount and performs no session check must not
 * be one of those. Route handlers import this module directly.
 *
 * @module features/finance/api/record-payment-internal
 */

import 'server-only';
import { revalidatePath } from 'next/cache';
import { getSystemClient } from '@/shared/api/supabase/system';
import type { RecordPaymentInput, RecordPaymentResult } from './invoice-actions';

/**
 * Record a payment with no session auth.
 *
 * ONLY for callers that have already established authority by other means --
 * today that is the Stripe webhook route, after `stripe.webhooks.constructEvent`
 * has verified the signature. There is deliberately no export of this from a
 * 'use server' module: that would publish it as a Server Action and make it an
 * unauthenticated way to mark any invoice paid.
 */
export async function recordPaymentFromWebhook(
  input: RecordPaymentInput,
): Promise<RecordPaymentResult> {
  return callRecordPaymentRpc(input, null);
}

export async function callRecordPaymentRpc(
  input: RecordPaymentInput,
  userId: string | null,
  eventId?: string,
): Promise<RecordPaymentResult> {
  const system = getSystemClient();

  const { data: paymentId, error } = await system
    .schema('finance')
    .rpc('record_payment', {
      p_invoice_id: input.invoiceId,
      p_amount: input.amount,
      p_method: input.method,
      p_received_at: input.receivedAt ?? new Date().toISOString(),
      p_reference: input.reference ?? undefined,
      p_notes: input.notes ?? undefined,
      p_stripe_payment_intent_id: input.stripePaymentIntentId ?? undefined,
      p_stripe_charge_id: input.stripeChargeId ?? undefined,
      p_status: input.status ?? 'succeeded',
      p_recorded_by_user_id: userId ?? undefined,
      p_parent_payment_id: input.parentPaymentId ?? undefined,
      p_attachment_storage_path: input.attachmentStoragePath ?? undefined,
    });

  if (error) {
    return { paymentId: null, error: error.message };
  }

  if (eventId) revalidatePath(`/events/${eventId}/finance`);
  revalidatePath('/events');
  revalidatePath('/finance');

  return { paymentId: paymentId as string, error: null };
}
