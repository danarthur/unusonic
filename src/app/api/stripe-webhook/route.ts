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

    case 'payment_intent.succeeded':
      return handlePaymentIntentSucceeded(event.data.object as Stripe.PaymentIntent);

    case 'payment_intent.payment_failed':
      return handlePaymentFailed(event.data.object as Stripe.PaymentIntent);

    // ─── Subscription lifecycle events ──────────────────────────────────────
    case 'customer.subscription.created':
      return handleSubscriptionCreated(event.data.object as Stripe.Subscription);

    case 'customer.subscription.updated':
      return handleSubscriptionUpdated(event.data.object as Stripe.Subscription);

    case 'customer.subscription.deleted':
      return handleSubscriptionDeleted(event.data.object as Stripe.Subscription);

    case 'invoice.paid':
      return handleInvoicePaid(event.data.object as Stripe.Invoice);

    case 'invoice.payment_failed':
      return handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);

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
// payment_intent.succeeded — proposal deposit
// =============================================================================

async function handlePaymentIntentSucceeded(paymentIntent: Stripe.PaymentIntent) {
  const { type, proposal_id } = paymentIntent.metadata ?? {};

  // Only handle proposal deposit intents — other succeeded intents are ignored
  if (type !== 'proposal_deposit' || !proposal_id) {
    return json({ received: true });
  }

  const supabase = getSystemClient();
   
  const from = (table: string) => (supabase as any).from(table);

  // Idempotency: skip if already marked paid
  const { data: existing } = await supabase
    .from('proposals')
    .select('id, deposit_paid_at, deal_id')
    .eq('id', proposal_id)
    .maybeSingle();

  if (!existing) {
    console.error('[Stripe Webhook] Proposal not found for deposit intent:', proposal_id);
    return json({ received: true });
  }

  const p = existing as { id: string; deposit_paid_at: string | null; deal_id: string | null };

  if (!p.deposit_paid_at) {
    // Mark the deposit as paid on the proposal
    const { error: updateError } = await supabase
      .from('proposals')
      .update({ deposit_paid_at: new Date().toISOString() })
      .eq('id', proposal_id);

    if (updateError) {
      console.error('[Stripe Webhook] Failed to update deposit_paid_at:', updateError.message);
      return json({ error: 'Failed to record deposit' }, 500);
    }

    // Advance the deal status to 'deposit_received' only if not already further along
    if (p.deal_id) {
      const { error: dealError } = await from('deals')
        .update({ status: 'deposit_received' })
        .eq('id', p.deal_id)
        .in('status', ['inquiry', 'proposal', 'contract_sent', 'contract_signed']);

      if (dealError) {
        // Non-fatal — log and continue; deposit_paid_at is the source of truth
        console.error('[Stripe Webhook] Failed to update deal status:', dealError.message);
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

// =============================================================================
// Subscription lifecycle handlers
// =============================================================================

/**
 * Resolve workspace_id from Stripe subscription metadata.
 * All subscriptions created via our code include workspace_id in metadata.
 */
function getWorkspaceIdFromSubscription(subscription: Stripe.Subscription): string | null {
  return subscription.metadata?.workspace_id ?? null;
}

/**
 * Resolve the tier slug from a Stripe subscription by looking up the price ID
 * in the tier_config table.
 */
async function resolveTierFromSubscription(
  subscription: Stripe.Subscription,
): Promise<string | null> {
  const supabase = getSystemClient();

  // Collect all price IDs from the subscription items
  const priceIds = subscription.items.data.map((item) => item.price.id);

  // Look for a tier_config row where stripe_price_id matches any subscription item
  const { data, error } = await (supabase as any)
    .from('tier_config')
    .select('tier, stripe_price_id')
    .in('stripe_price_id', priceIds)
    .maybeSingle();

  if (error || !data) {
    console.warn('[Stripe Webhook] Could not resolve tier from subscription prices:', priceIds);
    return null;
  }

  return data.tier as string;
}

// =============================================================================
// customer.subscription.created
// =============================================================================

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const workspaceId = getWorkspaceIdFromSubscription(subscription);
  if (!workspaceId) {
    console.warn('[Stripe Webhook] subscription.created missing workspace_id metadata:', subscription.id);
    return json({ received: true });
  }

  const supabase = getSystemClient();

  // Idempotency: check if this subscription ID is already stored
  const { data: existing } = await supabase
    .from('workspaces')
    .select('id, stripe_subscription_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (existing?.stripe_subscription_id === subscription.id) {
    return json({ received: true, deduplicated: true });
  }

  const tier = await resolveTierFromSubscription(subscription);

  const updatePayload: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    billing_status: 'active',
  };

  if (tier) {
    updatePayload.subscription_tier = tier;
  }

  const { error } = await supabase
    .from('workspaces')
    .update(updatePayload as any)
    .eq('id', workspaceId);

  if (error) {
    console.error('[Stripe Webhook] subscription.created DB update failed:', error.message);
    return json({ error: 'Failed to confirm subscription' }, 500);
  }

  return json({ received: true });
}

// =============================================================================
// customer.subscription.updated
// =============================================================================

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const workspaceId = getWorkspaceIdFromSubscription(subscription);
  if (!workspaceId) {
    console.warn('[Stripe Webhook] subscription.updated missing workspace_id metadata:', subscription.id);
    return json({ received: true });
  }

  const supabase = getSystemClient();

  const updatePayload: Record<string, unknown> = {};

  // Sync tier from subscription prices
  const tier = await resolveTierFromSubscription(subscription);
  if (tier) {
    // Only update if different from current
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('subscription_tier')
      .eq('id', workspaceId)
      .maybeSingle();

    if (workspace && workspace.subscription_tier !== tier) {
      updatePayload.subscription_tier = tier;
    }
  }

  // Sync extra seat quantity — look for items that are NOT the base tier price
  const tierConfig = tier
    ? await (async () => {
        const { data } = await (supabase as any)
          .from('tier_config')
          .select('stripe_price_id, stripe_extra_seat_price_id')
          .eq('tier', tier)
          .maybeSingle();
        return data;
      })()
    : null;

  if (tierConfig?.stripe_extra_seat_price_id) {
    const seatItem = subscription.items.data.find(
      (item) => item.price.id === tierConfig.stripe_extra_seat_price_id,
    );
    if (seatItem) {
      updatePayload.extra_seats = seatItem.quantity ?? 0;
    }
  }

  // Sync billing status
  if (subscription.cancel_at_period_end) {
    updatePayload.billing_status = 'canceling';
  } else if (subscription.status === 'active') {
    updatePayload.billing_status = 'active';
  } else if (subscription.status === 'past_due') {
    updatePayload.billing_status = 'past_due';
  }

  // Only update if there's something to change
  if (Object.keys(updatePayload).length === 0) {
    return json({ received: true });
  }

  const { error } = await supabase
    .from('workspaces')
    .update(updatePayload as any)
    .eq('id', workspaceId);

  if (error) {
    console.error('[Stripe Webhook] subscription.updated DB update failed:', error.message);
    return json({ error: 'Failed to sync subscription update' }, 500);
  }

  return json({ received: true });
}

// =============================================================================
// customer.subscription.deleted
// =============================================================================

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const workspaceId = getWorkspaceIdFromSubscription(subscription);
  if (!workspaceId) {
    console.warn('[Stripe Webhook] subscription.deleted missing workspace_id metadata:', subscription.id);
    return json({ received: true });
  }

  const supabase = getSystemClient();

  // Idempotency: check current state
  // billing_status column added by tier migration — not yet in generated types
  const { data: workspace } = await (supabase as any)
    .from('workspaces')
    .select('billing_status')
    .eq('id', workspaceId)
    .maybeSingle();

  if ((workspace as any)?.billing_status === 'canceled') {
    return json({ received: true, deduplicated: true });
  }

  // Downgrade to foundation (free tier) and mark canceled
  const { error } = await supabase
    .from('workspaces')
    .update({
      billing_status: 'canceled',
      subscription_tier: 'foundation',
      extra_seats: 0,
    } as any)
    .eq('id', workspaceId);

  if (error) {
    console.error('[Stripe Webhook] subscription.deleted DB update failed:', error.message);
    return json({ error: 'Failed to process cancellation' }, 500);
  }

  return json({ received: true });
}

// =============================================================================
// invoice.paid — subscription billing period reset
// =============================================================================

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  // Only handle subscription invoices, not one-off payment intents
  // In Stripe API 2026-02-25.clover, subscription is under parent.subscription_details
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionRef) {
    return json({ received: true });
  }

  const subscriptionId =
    typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

  const supabase = getSystemClient();

  // Look up workspace by subscription ID
  // billing_status + aion columns not yet in generated types
  const { data: workspace } = await (supabase as any)
    .from('workspaces')
    .select('id, billing_status')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!workspace) {
    console.warn('[Stripe Webhook] invoice.paid — no workspace for subscription:', subscriptionId);
    return json({ received: true });
  }

  const ws = workspace as { id: string; billing_status: string | null };

  // Reset Aion action counter for the new billing period and ensure active status
  const { error } = await (supabase as any)
    .from('workspaces')
    .update({
      aion_actions_used: 0,
      aion_actions_reset_at: new Date().toISOString(),
      billing_status: 'active',
    })
    .eq('id', ws.id);

  if (error) {
    console.error('[Stripe Webhook] invoice.paid DB update failed:', error.message);
    return json({ error: 'Failed to process invoice payment' }, 500);
  }

  return json({ received: true });
}

// =============================================================================
// invoice.payment_failed — mark workspace past due
// =============================================================================

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  // Only handle subscription invoices
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionRef) {
    return json({ received: true });
  }

  const subscriptionId =
    typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

  const supabase = getSystemClient();

  // Look up workspace by subscription ID
  // billing_status column not yet in generated types
  const { data: workspace } = await (supabase as any)
    .from('workspaces')
    .select('id, billing_status')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!workspace) {
    console.warn('[Stripe Webhook] invoice.payment_failed — no workspace for subscription:', subscriptionId);
    return json({ received: true });
  }

  const ws = workspace as { id: string; billing_status: string | null };

  // Idempotency: skip if already past_due
  if (ws.billing_status === 'past_due') {
    return json({ received: true, deduplicated: true });
  }

  const { error } = await (supabase as any)
    .from('workspaces')
    .update({ billing_status: 'past_due' })
    .eq('id', ws.id);

  if (error) {
    console.error('[Stripe Webhook] invoice.payment_failed DB update failed:', error.message);
    return json({ error: 'Failed to update billing status' }, 500);
  }

  return json({ received: true });
}
