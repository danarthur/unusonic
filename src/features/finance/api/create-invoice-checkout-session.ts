'use server';

/**
 * Finance feature – Create a Stripe Checkout Session for an invoice payment.
 *
 * Public flow: client opens /i/[token], clicks "Pay now" → calls this action →
 * redirected to Stripe-hosted Checkout → on success Stripe fires
 * checkout.session.completed → /api/stripe-webhooks/client-billing records the
 * payment via finance.record_payment.
 *
 * No user session — the public_token is the only identity proof. Server uses
 * the system client to read the invoice. Workspace must have
 * accept_online_payments = true.
 *
 * @module features/finance/api/create-invoice-checkout-session
 */

import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import { getStripe } from '@/shared/api/stripe/server';

export interface CreateInvoiceCheckoutSessionResult {
  url: string | null;
  error?: string;
}

export async function createInvoiceCheckoutSession(
  token: string
): Promise<CreateInvoiceCheckoutSessionResult> {
  const trimmed = token?.trim();
  if (!trimmed) return { url: null, error: 'Invalid token' };

  const stripe = getStripe();
  if (!stripe) return { url: null, error: 'Stripe not configured' };

  const supabase = getSystemClient();

  // Fetch the invoice via the same RPC the public page uses.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types
  const { data, error } = await (supabase as any)
    .schema('finance')
    .rpc('get_public_invoice', { p_token: trimmed });

  if (error) return { url: null, error: error.message };
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return { url: null, error: 'Invoice not found' };

  if (!row.accept_online_payments) {
    return { url: null, error: 'This workspace does not accept online payments yet' };
  }

  if (row.status === 'paid' || row.status === 'void') {
    return { url: null, error: 'This invoice cannot be paid online' };
  }

  // discount_amount is already netted into total_amount by finance.spawn_invoices_*
  // for new invoices, but legacy rows can carry a non-zero discount_amount that
  // wasn't subtracted into total_amount. Subtract again here so the Stripe
  // session never overcharges. `Math.max(0, …)` clamps the rare double-discount
  // case so we never charge a negative amount.
  const totalAmount = Number(row.total_amount);
  const paidAmount = Number(row.paid_amount);
  const discountAmount = Number(row.discount_amount ?? 0);
  const balanceDue = Math.max(0, totalAmount - paidAmount - discountAmount);
  if (!(balanceDue > 0)) {
    return { url: null, error: 'No balance due' };
  }

  // Stripe expects integer cents. Round-half-up to avoid sub-cent drift.
  const amountCents = Math.round(balanceDue * 100);
  const currency = String(row.currency ?? 'usd').toLowerCase();
  const workspaceName =
    (row.from_snapshot as { workspace_name?: string } | null)?.workspace_name ?? 'Invoice';
  const invoiceNumber = String(row.invoice_number ?? row.invoice_id);

  const baseUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000').replace(/\/$/, '');
  const returnUrl = `${baseUrl}/i/${trimmed}`;

  let session;
  try {
    session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          quantity: 1,
          price_data: {
            currency,
            unit_amount: amountCents,
            product_data: {
              name: `${workspaceName} — Invoice ${invoiceNumber}`,
            },
          },
        },
      ],
      success_url: `${returnUrl}?paid=1`,
      cancel_url: returnUrl,
      metadata: {
        unusonic_invoice_id: String(row.invoice_id),
        unusonic_workspace_id: String(row.workspace_id),
        unusonic_invoice_token: trimmed,
      },
      payment_intent_data: {
        metadata: {
          unusonic_invoice_id: String(row.invoice_id),
          unusonic_workspace_id: String(row.workspace_id),
          unusonic_invoice_token: trimmed,
        },
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe Checkout creation failed';
    return { url: null, error: message };
  }

  if (!session.url) {
    return { url: null, error: 'Stripe did not return a Checkout URL' };
  }

  return { url: session.url };
}
