/**
 * Stripe Webhook — Subscription Billing
 *
 * Handles Unusonic's own SaaS subscription lifecycle: tier changes, seat
 * updates, payment successes/failures, cancellations. Writes to
 * public.workspaces columns only.
 *
 * Split from the legacy /api/stripe-webhook to isolate subscription billing
 * from client billing. A bug in client payment processing can never break
 * subscription state, and vice versa.
 *
 * Uses STRIPE_WEBHOOK_SECRET_SUBSCRIPTION (separate Stripe endpoint secret).
 * Dedup via finance.stripe_webhook_events with source='subscription'.
 *
 * @module app/api/stripe-webhooks/subscription/route
 */

import { NextRequest, NextResponse } from 'next/server';
import type Stripe from 'stripe';
import * as Sentry from '@sentry/nextjs';
import { getStripe } from '@/shared/api/stripe/server';
import { getSystemClient } from '@/shared/api/supabase/system';

export const runtime = 'nodejs';

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, { status });
}

// =============================================================================
// POST /api/stripe-webhooks/subscription
// =============================================================================

export async function POST(req: NextRequest) {
  const stripe = getStripe();
  if (!stripe) return json({ error: 'Stripe not configured' }, 500);

  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_SUBSCRIPTION
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
    Sentry.logger.error('stripe.subscription.signatureVerificationFailed', { error: message });
    return json({ error: message }, 400);
  }

  // ── Event dedup via finance.stripe_webhook_events ──────────────────────────
  const supabase = getSystemClient();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- finance schema not yet in PostgREST types
  const { data: dedupRow } = await (supabase as any)
    .schema('finance')
    .from('stripe_webhook_events')
    .insert({
      stripe_event_id: event.id,
      source: 'subscription',
      event_type: event.type,
      payload: event.data.object,
      received_at: new Date().toISOString(),
    })
    .select('stripe_event_id')
    .maybeSingle();

  if (!dedupRow) {
    // Already processed — ON CONFLICT returns null
    return json({ received: true, deduplicated: true });
  }

  // ── Event routing ──────────────────────────────────────────────────────────
  let result: NextResponse;
  try {
    switch (event.type) {
      case 'customer.subscription.created':
        result = await handleSubscriptionCreated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.updated':
        result = await handleSubscriptionUpdated(event.data.object as Stripe.Subscription);
        break;
      case 'customer.subscription.deleted':
        result = await handleSubscriptionDeleted(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.paid':
        result = await handleInvoicePaid(event.data.object as Stripe.Invoice);
        break;
      case 'invoice.payment_failed':
        result = await handleInvoicePaymentFailed(event.data.object as Stripe.Invoice);
        break;
      case 'customer.subscription.trial_will_end':
        result = await handleTrialWillEnd(event.data.object as Stripe.Subscription, event.id);
        break;
      case 'invoice.upcoming':
      case 'invoice.finalized':
        result = await handleInvoiceCacheEvent(event.data.object as Stripe.Invoice, event.id);
        break;
      default:
        result = json({ received: true });
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    Sentry.captureException(e);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any).schema('finance').from('stripe_webhook_events')
      .update({ processing_error: message })
      .eq('stripe_event_id', event.id);
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
// Subscription helpers (preserved from legacy route — behavior unchanged)
// =============================================================================

function getWorkspaceIdFromSubscription(subscription: Stripe.Subscription): string | null {
  return subscription.metadata?.workspace_id ?? null;
}

type SubscriptionTier = 'foundation' | 'growth' | 'studio';

async function resolveTierFromSubscription(
  subscription: Stripe.Subscription,
): Promise<SubscriptionTier | null> {
  const supabase = getSystemClient();
  const priceIds = subscription.items.data.map((item) => item.price.id);

  const { data, error } = await supabase
    .from('tier_config')
    .select('tier, stripe_price_id')
    .in('stripe_price_id', priceIds)
    .maybeSingle();

  if (error || !data) {
    Sentry.logger.warn('stripe.subscription.tierResolveFailed', { priceIds: priceIds.join(',') });
    return null;
  }

  return data.tier as SubscriptionTier;
}

// =============================================================================
// customer.subscription.created
// =============================================================================

async function handleSubscriptionCreated(subscription: Stripe.Subscription) {
  const workspaceId = getWorkspaceIdFromSubscription(subscription);
  if (!workspaceId) {
    Sentry.logger.warn('stripe.subscription.missingWorkspaceId', { subscriptionId: subscription.id });
    return json({ received: true });
  }

  const supabase = getSystemClient();

  const { data: existing } = await supabase
    .from('workspaces')
    .select('id, stripe_subscription_id')
    .eq('id', workspaceId)
    .maybeSingle();

  if (existing?.stripe_subscription_id === subscription.id) {
    return json({ received: true, deduplicated: true });
  }

  const tier = await resolveTierFromSubscription(subscription);

  const sub = subscription as any; // Stripe API version may not have all fields typed
  const trialEnd = sub.trial_end
    ? new Date(sub.trial_end * 1000).toISOString()
    : null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString()
    : null;

  const updatePayload: Record<string, unknown> = {
    stripe_subscription_id: subscription.id,
    billing_status: 'active',
    current_period_end: periodEnd,
    trial_ends_at: trialEnd,
    cancel_at_period_end: subscription.cancel_at_period_end ?? false,
  };
  if (tier) updatePayload.subscription_tier = tier;

  const { error } = await supabase
    .from('workspaces')
    .update(updatePayload as any)
    .eq('id', workspaceId);

  if (error) {
    Sentry.logger.error('stripe.subscription.dbUpdateFailed', { event: 'created', error: error.message });
    return json({ error: 'Failed to confirm subscription' }, 500);
  }

  // Audit event
  await writeSubscriptionEvent(workspaceId, trialEnd ? 'trial_started' : 'created', null, {
    tier: tier ?? 'unknown',
    billing_status: 'active',
    trial_ends_at: trialEnd,
  });

  return json({ received: true });
}

// =============================================================================
// customer.subscription.updated
// =============================================================================

async function handleSubscriptionUpdated(subscription: Stripe.Subscription) {
  const workspaceId = getWorkspaceIdFromSubscription(subscription);
  if (!workspaceId) {
    Sentry.logger.warn('stripe.subscription.missingWorkspaceId', { subscriptionId: subscription.id });
    return json({ received: true });
  }

  const supabase = getSystemClient();
  const updatePayload: Record<string, unknown> = {};

  const tier = await resolveTierFromSubscription(subscription);
  if (tier) {
    const { data: workspace } = await supabase
      .from('workspaces')
      .select('subscription_tier')
      .eq('id', workspaceId)
      .maybeSingle();

    if (workspace && workspace.subscription_tier !== tier) {
      updatePayload.subscription_tier = tier;
    }
  }

  const tierConfig = tier
    ? await (async () => {
        const { data } = await supabase
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

  if (subscription.cancel_at_period_end) {
    updatePayload.billing_status = 'canceling';
  } else if (subscription.status === 'active') {
    updatePayload.billing_status = 'active';
  } else if (subscription.status === 'past_due') {
    updatePayload.billing_status = 'past_due';
  }

  // Always cache subscription metadata, even if no tier/seat change
  const subAny = subscription as any; // Stripe API version may not type all fields
  const periodEnd = subAny.current_period_end
    ? new Date(subAny.current_period_end * 1000).toISOString()
    : null;
  const trialEnd = subAny.trial_end
    ? new Date(subAny.trial_end * 1000).toISOString()
    : null;

  updatePayload.current_period_end = periodEnd;
  updatePayload.trial_ends_at = trialEnd;
  updatePayload.cancel_at_period_end = subscription.cancel_at_period_end ?? false;

  if (Object.keys(updatePayload).length === 0) {
    return json({ received: true });
  }

  // Capture from_state for audit before updating
  const { data: prevWorkspace } = await supabase
    .from('workspaces')
    .select('subscription_tier, billing_status, extra_seats')
    .eq('id', workspaceId)
    .maybeSingle();

  const { error } = await supabase
    .from('workspaces')
    .update(updatePayload as any)
    .eq('id', workspaceId);

  if (error) {
    Sentry.logger.error('stripe.subscription.dbUpdateFailed', { event: 'updated', error: error.message });
    return json({ error: 'Failed to sync subscription update' }, 500);
  }

  // Determine audit event kind
  if (tier && prevWorkspace && prevWorkspace.subscription_tier !== tier) {
    await writeSubscriptionEvent(workspaceId, 'tier_changed',
      { tier: prevWorkspace.subscription_tier },
      { tier, ...updatePayload },
    );
  } else if (updatePayload.extra_seats !== undefined && prevWorkspace) {
    await writeSubscriptionEvent(workspaceId, 'seats_changed',
      { extra_seats: prevWorkspace.extra_seats },
      { extra_seats: updatePayload.extra_seats },
    );
  }

  return json({ received: true });
}

// =============================================================================
// customer.subscription.deleted
// =============================================================================

async function handleSubscriptionDeleted(subscription: Stripe.Subscription) {
  const workspaceId = getWorkspaceIdFromSubscription(subscription);
  if (!workspaceId) {
    Sentry.logger.warn('stripe.subscription.missingWorkspaceId', { subscriptionId: subscription.id });
    return json({ received: true });
  }

  const supabase = getSystemClient();

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('billing_status')
    .eq('id', workspaceId)
    .maybeSingle();

  if ((workspace as any)?.billing_status === 'canceled') {
    return json({ received: true, deduplicated: true });
  }

  const { error } = await supabase
    .from('workspaces')
    .update({
      billing_status: 'canceled',
      subscription_tier: 'foundation',
      extra_seats: 0,
    } as any)
    .eq('id', workspaceId);

  if (error) {
    Sentry.logger.error('stripe.subscription.dbUpdateFailed', { event: 'deleted', error: error.message });
    return json({ error: 'Failed to process cancellation' }, 500);
  }

  await writeSubscriptionEvent(workspaceId, 'canceled',
    { billing_status: (workspace as any)?.billing_status },
    { billing_status: 'canceled', subscription_tier: 'foundation' },
  );

  return json({ received: true });
}

// =============================================================================
// invoice.paid — subscription billing period reset
// =============================================================================

async function handleInvoicePaid(invoice: Stripe.Invoice) {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionRef) return json({ received: true });

  const subscriptionId =
    typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

  const supabase = getSystemClient();

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, billing_status')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!workspace) {
    Sentry.logger.warn('stripe.subscription.noWorkspace', { subscriptionId, event: 'invoice.paid' });
    return json({ received: true });
  }

  const ws = workspace as { id: string; billing_status: string | null };

  const { error } = await supabase
    .from('workspaces')
    .update({
      aion_actions_used: 0,
      aion_actions_reset_at: new Date().toISOString(),
      billing_status: 'active',
      last_payment_failed_at: null,
      grace_period_ends_at: null,
    } as any)
    .eq('id', ws.id);

  if (error) {
    Sentry.logger.error('stripe.subscription.dbUpdateFailed', { event: 'invoice.paid', error: error.message });
    return json({ error: 'Failed to process invoice payment' }, 500);
  }

  // Cache invoice to subscription_invoices
  await cacheSubscriptionInvoice(ws.id, invoice);
  await writeSubscriptionEvent(ws.id, 'payment_succeeded', null, {
    invoice_id: invoice.id,
    amount_paid: (invoice.amount_paid ?? 0) / 100,
  });

  return json({ received: true });
}

// =============================================================================
// invoice.payment_failed — mark workspace past due
// =============================================================================

async function handleInvoicePaymentFailed(invoice: Stripe.Invoice) {
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionRef) return json({ received: true });

  const subscriptionId =
    typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

  const supabase = getSystemClient();

  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id, billing_status')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!workspace) {
    Sentry.logger.warn('stripe.subscription.noWorkspace', { subscriptionId, event: 'invoice.payment_failed' });
    return json({ received: true });
  }

  const ws = workspace as { id: string; billing_status: string | null };

  if (ws.billing_status === 'past_due') {
    return json({ received: true, deduplicated: true });
  }

  const now = new Date().toISOString();
  const gracePeriodEnd = new Date(Date.now() + 7 * 86400 * 1000).toISOString(); // 7 days

  const { error } = await supabase
    .from('workspaces')
    .update({
      billing_status: 'past_due',
      last_payment_failed_at: now,
      grace_period_ends_at: gracePeriodEnd,
    } as any)
    .eq('id', ws.id);

  if (error) {
    Sentry.logger.error('stripe.subscription.dbUpdateFailed', { event: 'invoice.payment_failed', error: error.message });
    return json({ error: 'Failed to update billing status' }, 500);
  }

  await writeSubscriptionEvent(ws.id, 'payment_failed', null, {
    invoice_id: invoice.id,
    grace_period_ends_at: gracePeriodEnd,
  });

  return json({ received: true });
}

// =============================================================================
// customer.subscription.trial_will_end — 3 days before trial expiry
// =============================================================================

async function handleTrialWillEnd(subscription: Stripe.Subscription, stripeEventId: string) {
  const workspaceId = getWorkspaceIdFromSubscription(subscription);
  if (!workspaceId) return json({ received: true });

  const trialEnd = subscription.trial_end
    ? new Date(subscription.trial_end * 1000).toISOString()
    : null;

  await writeSubscriptionEvent(workspaceId, 'trial_ended', null, {
    trial_ends_at: trialEnd,
    stripe_event_id: stripeEventId,
  });

  // TODO (PR-SUB-4): send email to workspace admin warning about trial end

  return json({ received: true });
}

// =============================================================================
// invoice.upcoming / invoice.finalized — cache to subscription_invoices
// =============================================================================

async function handleInvoiceCacheEvent(invoice: Stripe.Invoice, stripeEventId: string) {
  // Only handle subscription invoices
  const subscriptionRef = invoice.parent?.subscription_details?.subscription;
  if (!subscriptionRef) return json({ received: true });

  const subscriptionId =
    typeof subscriptionRef === 'string' ? subscriptionRef : subscriptionRef.id;

  const supabase = getSystemClient();
  const { data: workspace } = await supabase
    .from('workspaces')
    .select('id')
    .eq('stripe_subscription_id', subscriptionId)
    .maybeSingle();

  if (!workspace) return json({ received: true });

  await cacheSubscriptionInvoice(workspace.id, invoice);
  return json({ received: true });
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * Write a subscription audit event to public.subscription_events.
 */
async function writeSubscriptionEvent(
  workspaceId: string,
  eventKind: string,
  fromState: Record<string, unknown> | null,
  toState: Record<string, unknown> | null,
  stripeEventId?: string,
) {
  try {
    const supabase = getSystemClient();
    await (supabase as any).from('subscription_events').insert({
      workspace_id: workspaceId,
      event_kind: eventKind,
      from_state: fromState,
      to_state: toState,
      stripe_event_id: stripeEventId ?? null,
    });
  } catch {
    // Audit write failure is non-fatal
  }
}

/**
 * Cache a Stripe invoice to public.subscription_invoices for UI display.
 */
async function cacheSubscriptionInvoice(workspaceId: string, invoice: Stripe.Invoice) {
  try {
    const supabase = getSystemClient();
    await (supabase as any).from('subscription_invoices').upsert({
      stripe_invoice_id: invoice.id,
      workspace_id: workspaceId,
      amount_due: (invoice.amount_due ?? 0) / 100,
      amount_paid: (invoice.amount_paid ?? 0) / 100,
      currency: invoice.currency ?? 'usd',
      status: invoice.status,
      period_start: invoice.period_start ? new Date(invoice.period_start * 1000).toISOString() : null,
      period_end: invoice.period_end ? new Date(invoice.period_end * 1000).toISOString() : null,
      hosted_invoice_url: invoice.hosted_invoice_url ?? null,
      invoice_pdf_url: invoice.invoice_pdf ?? null,
    }, { onConflict: 'stripe_invoice_id' });
  } catch {
    // Cache write failure is non-fatal
  }
}
