/**
 * Stripe Webhook Handler
 * Processes checkout.session.completed and payment_intent.payment_failed events.
 * Uses system client (no user session in webhooks).
 *
 * NOTE: `invoices` and `payments` tables are not yet in the generated Supabase
 * types (they predate the finance-schema migration). Each handler creates
 * the system client once and uses a local `from()` closure to keep the
 * single type escape contained.
 *
 * @module app/api/stripe-webhook/route
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import { getStripe } from '@/shared/api/stripe/server';
import { getSystemClient } from '@/shared/api/supabase/system';

// =============================================================================
// Helpers
// =============================================================================

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

// =============================================================================
// POST /api/stripe-webhook
// =============================================================================

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) {
    return json({ error: 'Stripe not configured' }, 500);
  }

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) {
    return json({ error: 'Webhook secret not configured' }, 500);
  }

  // Raw body required for signature verification
  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) {
    return json({ error: 'Missing stripe-signature header' }, 400);
  }

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    console.error('[Stripe Webhook] Signature verification failed:', message);
    return json({ error: message }, 400);
  }

  // -------------------------------------------------------------------------
  // Event routing
  // -------------------------------------------------------------------------

  switch (event.type) {
    case 'checkout.session.completed':
      return handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);

    case 'payment_intent.payment_failed':
      return handlePaymentFailed(event.data.object as Stripe.PaymentIntent);

    default:
      return json({ received: true });
  }
}

// =============================================================================
// checkout.session.completed
// =============================================================================

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.invoice_id;
  const workspaceId = session.metadata?.workspace_id;
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!invoiceId || !workspaceId || !paymentIntentId) {
    console.error('[Stripe Webhook] Missing metadata on checkout session', session.id);
    return json({ error: 'Missing metadata' }, 400);
  }

  const supabase = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string) => (supabase as any).from(table);

  // Idempotency: skip if we already recorded this payment
  const { data: existing } = await from('payments')
    .select('id')
    .eq('reference_id', paymentIntentId)
    .eq('status', 'succeeded')
    .maybeSingle();

  if (existing) {
    return json({ received: true, deduplicated: true });
  }

  // Fetch invoice and cross-check workspace_id against Stripe metadata before processing
  const { data: invoiceForCheck } = await from('invoices')
    .select('id, workspace_id, total_amount')
    .eq('id', invoiceId)
    .single();

  if (!invoiceForCheck) {
    console.error('[Stripe Webhook] Invoice not found:', invoiceId);
    return json({ error: 'Invoice not found' }, 404);
  }

  if ((invoiceForCheck as { workspace_id?: string }).workspace_id !== workspaceId) {
    console.error('[stripe-webhook] workspace_id mismatch — possible payload forgery');
    return json({ error: 'Forbidden' }, 403);
  }

  // Convert cents → dollars for DB storage
  const amountDollars = (session.amount_total ?? 0) / 100;

  // Insert payment row
  const { error: payError } = await from('payments').insert({
    invoice_id: invoiceId,
    workspace_id: workspaceId,
    amount: amountDollars,
    method: 'stripe',
    status: 'succeeded',
    reference_id: paymentIntentId,
  });

  if (payError) {
    console.error('[Stripe Webhook] Failed to insert payment:', payError.message);
    return json({ error: 'Failed to record payment' }, 500);
  }

  // Check if invoice is now fully paid (reuse already-fetched invoice)
  if (invoiceForCheck) {
    const invoice = invoiceForCheck;
    const { data: paymentRows } = await from('payments')
      .select('amount')
      .eq('invoice_id', invoiceId)
      .eq('status', 'succeeded');

    type AmountRow = { amount: unknown };
    const totalPaid = (paymentRows ?? []).reduce(
      (sum: number, p: AmountRow) => sum + Number(p.amount),
      0,
    );

    if (totalPaid >= Number(invoice.total_amount)) {
      await from('invoices')
        .update({ status: 'paid' })
        .eq('id', invoiceId);

      // Bust cached public invoice page so next request serves fresh data
      const invoiceToken = session.metadata?.invoice_token;
      if (invoiceToken) {
        const { revalidatePath } = await import('next/cache');
        revalidatePath(`/i/${invoiceToken}`);
      }
    }
  }

  return json({ received: true });
}

// =============================================================================
// payment_intent.payment_failed
// =============================================================================

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const supabase = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const from = (table: string) => (supabase as any).from(table);

  // Update any pending payment rows for this payment intent to failed
  const { error } = await from('payments')
    .update({ status: 'failed' })
    .eq('reference_id', paymentIntent.id)
    .eq('status', 'pending');

  if (error) {
    console.error('[Stripe Webhook] Failed to update payment status:', error.message);
    return json({ error: 'Failed to update payment status' }, 500);
  }

  return json({ received: true });
}
