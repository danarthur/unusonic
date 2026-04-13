/**
 * Stripe Webhook — Client Billing
 *
 * Handles payment events for client invoices: checkout completions,
 * payment intent successes (proposal deposits), payment failures, refunds.
 * Writes to finance.payments via the canonical record_payment RPC.
 *
 * Split from the legacy /api/stripe-webhook to isolate client billing
 * from subscription billing. A bug here cannot break SaaS subscription state.
 *
 * Uses STRIPE_WEBHOOK_SECRET_CLIENT (separate Stripe endpoint secret).
 * Dedup via finance.stripe_webhook_events with source='client_billing'.
 *
 * @module app/api/stripe-webhooks/client-billing/route
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { getStripe } from '@/shared/api/stripe/server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { recordPaymentFromWebhook } from '@/features/finance/api/invoice-actions';

export const runtime = 'nodejs';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

// =============================================================================
// POST /api/stripe-webhooks/client-billing
// =============================================================================

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return json({ error: 'Stripe not configured' }, 500);

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_CLIENT
    ?? process.env.STRIPE_WEBHOOK_SECRET; // fallback during migration
  if (!webhookSecret) return json({ error: 'Webhook secret not configured' }, 500);

  const body = await req.text();
  const sig = req.headers.get('stripe-signature');
  if (!sig) return json({ error: 'Missing stripe-signature header' }, 400);

  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(body, sig, webhookSecret);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Signature verification failed';
    Sentry.logger.error('stripe.clientBilling.signatureVerificationFailed', { error: message });
    return json({ error: message }, 400);
  }

  // ── Event dedup via finance.stripe_webhook_events ──────────────────────────
  // Resolve workspace_id from event metadata before inserting (Critic §4c:
  // never insert with NULL workspace_id then patch later).
  const eventObj = event.data.object as unknown as Record<string, unknown>;
  const metadata = (eventObj.metadata ?? {}) as Record<string, string>;
  const workspaceId = metadata.unusonic_workspace_id
    ?? metadata.workspace_id
    ?? null;

  const supabase = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types
  const { data: dedupRow } = await (supabase as any)
    .schema('finance')
    .from('stripe_webhook_events')
    .insert({
      stripe_event_id: event.id,
      source: 'client_billing',
      event_type: event.type,
      workspace_id: workspaceId,
      payload: event.data.object,
      received_at: new Date().toISOString(),
    })
    .select('stripe_event_id')
    .maybeSingle();

  if (!dedupRow) {
    return json({ received: true, deduplicated: true });
  }

  // ── Event routing ──────────────────────────────────────────────────────────
  let result: NextResponse;
  try {
    switch (event.type) {
      case 'checkout.session.completed':
        result = await handleCheckoutCompleted(event.data.object as Stripe.Checkout.Session);
        break;

      case 'payment_intent.succeeded':
        result = await handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);
        break;

      case 'payment_intent.payment_failed':
        result = await handlePaymentFailed(event.data.object as Stripe.PaymentIntent);
        break;

      case 'charge.refunded':
        result = await handleChargeRefunded(event.data.object as Stripe.Charge);
        break;

      default:
        result = json({ received: true });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    Sentry.captureException(e);
    // Processing failed — Stripe will retry with the same event.id.  Delete
    // the dedup row we just inserted so the retry can re-run the routing;
    // otherwise the unique constraint sends every retry into the silent
    // `!dedupRow → deduplicated: true` branch and the event never processes.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).schema('finance').from('stripe_webhook_events')
      .delete()
      .eq('stripe_event_id', event.id);
    Sentry.logger.error('stripe.clientBilling.routingFailed', {
      event_id: event.id,
      event_type: event.type,
      workspace_id: workspaceId,
      error: message,
    });
    return json({ error: 'Internal error' }, 500);
  }

  // Mark as processed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  await (supabase as any).schema('finance').from('stripe_webhook_events')
    .update({ processed_at: new Date().toISOString() })
    .eq('stripe_event_id', event.id);

  return result;
}

// =============================================================================
// checkout.session.completed — client pays an invoice via Stripe Checkout
// =============================================================================

async function handleCheckoutCompleted(session: Stripe.Checkout.Session) {
  const invoiceId = session.metadata?.unusonic_invoice_id;
  const workspaceId = session.metadata?.unusonic_workspace_id;
  const paymentIntentId =
    typeof session.payment_intent === 'string'
      ? session.payment_intent
      : session.payment_intent?.id;

  if (!invoiceId || !workspaceId || !paymentIntentId) {
    Sentry.logger.error('stripe.clientBilling.missingMetadata', { sessionId: session.id });
    return json({ error: 'Missing metadata' }, 400);
  }

  // Convert cents → dollars (per CLAUDE.md §6.4: cents only at Stripe boundary).
  // Guard against zero / missing amount_total (free-trial or wallet-credit edge
  // cases) — recording a $0 payment would corrupt collected totals.
  const amountTotal = session.amount_total;
  if (amountTotal == null || amountTotal <= 0) {
    Sentry.logger.warn('stripe.clientBilling.zeroOrMissingAmountTotal', {
      sessionId: session.id,
      invoiceId,
      workspaceId,
      amountTotal,
    });
    return json({ received: true, skipped: 'zero_amount_total' });
  }
  const amountDollars = amountTotal / 100;

  const { error } = await recordPaymentFromWebhook({
    invoiceId,
    amount: amountDollars,
    method: 'stripe_card',
    stripePaymentIntentId: paymentIntentId,
    status: 'succeeded',
  });

  if (error) {
    // The RPC handles Stripe idempotency: if stripe_payment_intent_id
    // already exists, it returns the existing payment ID (not an error).
    // An actual error here means a real problem.
    Sentry.logger.error('stripe.clientBilling.recordPaymentFailed', {
      invoiceId,
      paymentIntentId,
      error,
    });
    return json({ error: 'Failed to record payment' }, 500);
  }

  // Bust cached public invoice page
  const invoiceToken = session.metadata?.unusonic_invoice_token;
  if (invoiceToken) {
    const { revalidatePath } = await import('next/cache');
    revalidatePath(`/i/${invoiceToken}`);
  }

  return json({ received: true });
}

// =============================================================================
// payment_intent.succeeded — proposal deposit (legacy flow, preserved Wave 1)
//
// The proposal deposit flow writes to proposals.deposit_paid_at, NOT to
// finance.payments. The spawn_invoices_from_proposal function handles
// retroactive payment row creation when the proposal is later accepted.
// This handler is preserved byte-for-byte from the legacy route.
// =============================================================================

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { type, proposal_id } = paymentIntent.metadata ?? {};

  // Only handle proposal deposit intents
  if (type !== 'proposal_deposit' || !proposal_id) {
    return json({ received: true });
  }

  const supabase = getSystemClient();

  const { data: existing } = await supabase
    .from('proposals')
    .select('id, deposit_paid_at, deal_id')
    .eq('id', proposal_id)
    .maybeSingle();

  if (!existing) {
    Sentry.logger.error('stripe.clientBilling.proposalNotFound', { proposalId: proposal_id });
    return json({ received: true });
  }

  if (!existing.deposit_paid_at) {
    const { error: updateError } = await supabase
      .from('proposals')
      .update({ deposit_paid_at: new Date().toISOString() })
      .eq('id', proposal_id);

    if (updateError) {
      Sentry.logger.error('stripe.clientBilling.depositUpdateFailed', {
        proposalId: proposal_id,
        error: updateError.message,
      });
      return json({ error: 'Failed to record deposit' }, 500);
    }

    if (existing.deal_id) {
      const { error: dealError } = await supabase.from('deals')
        .update({ status: 'deposit_received' })
        .eq('id', existing.deal_id)
        .in('status', ['inquiry', 'proposal', 'contract_sent', 'contract_signed']);

      if (dealError) {
        Sentry.logger.warn('stripe.clientBilling.dealStatusUpdateFailed', {
          dealId: existing.deal_id,
          error: dealError.message,
        });
      }
    }
  }

  return json({ received: true });
}

// =============================================================================
// payment_intent.payment_failed — mark payment as failed in finance.payments
// =============================================================================

async function handlePaymentFailed(paymentIntent: Stripe.PaymentIntent) {
  const supabase = getSystemClient();

  // Update any pending payment rows for this payment intent to failed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types
  const { error } = await (supabase as any)
    .schema('finance')
    .from('payments')
    .update({ status: 'failed', failure_reason: paymentIntent.last_payment_error?.message ?? null })
    .eq('stripe_payment_intent_id', paymentIntent.id)
    .eq('status', 'pending');

  if (error) {
    Sentry.logger.error('stripe.clientBilling.paymentStatusUpdateFailed', {
      paymentIntentId: paymentIntent.id,
      error: error.message,
    });
    return json({ error: 'Failed to update payment status' }, 500);
  }

  return json({ received: true });
}

// =============================================================================
// charge.refunded — create a negative payment row for the refunded amount
// =============================================================================

async function handleChargeRefunded(charge: Stripe.Charge) {
  const supabase = getSystemClient();
  const paymentIntentId =
    typeof charge.payment_intent === 'string'
      ? charge.payment_intent
      : charge.payment_intent?.id;

  if (!paymentIntentId) {
    return json({ received: true });
  }

  // Look up the original payment by stripe_payment_intent_id
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: originalPayment } = await (supabase as any)
    .schema('finance')
    .from('payments')
    .select('id, invoice_id')
    .eq('stripe_payment_intent_id', paymentIntentId)
    .eq('status', 'succeeded')
    .maybeSingle();

  if (!originalPayment) {
    Sentry.logger.warn('stripe.clientBilling.refundNoOriginalPayment', { paymentIntentId });
    return json({ received: true });
  }

  // Compute refund amount (cents → dollars)
  const refundAmountDollars = (charge.amount_refunded ?? 0) / 100;

  const { error } = await recordPaymentFromWebhook({
    invoiceId: originalPayment.invoice_id,
    amount: -refundAmountDollars,
    method: 'stripe_card',
    stripeChargeId: charge.id,
    status: 'succeeded',
    parentPaymentId: originalPayment.id,
    reference: `Refund: ${charge.id}`,
  });

  if (error) {
    Sentry.logger.error('stripe.clientBilling.refundRecordFailed', {
      chargeId: charge.id,
      paymentIntentId,
      error,
    });
    return json({ error: 'Failed to record refund' }, 500);
  }

  return json({ received: true });
}
