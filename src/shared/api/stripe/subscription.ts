/**
 * Stripe subscription lifecycle management.
 * All functions are feature-flagged behind ENABLE_STRIPE_BILLING.
 * When the flag is off, functions perform bare DB updates only.
 *
 * @module shared/api/stripe/subscription
 */

import 'server-only';

import type Stripe from 'stripe';
import { getStripe } from './server';
import { getSystemClient } from '@/shared/api/supabase/system';
import { TIER_CONFIG, type TierSlug } from '@/shared/lib/tier-config';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function isBillingEnabled(): boolean {
  return process.env.ENABLE_STRIPE_BILLING === 'true';
}

function requireStripe(): Stripe {
  const stripe = getStripe();
  if (!stripe) {
    throw new Error('Stripe is not configured (missing STRIPE_SECRET_KEY)');
  }
  return stripe;
}

/**
 * Fetch tier config row from DB for Stripe price IDs.
 * Falls back to null if the row doesn't have price IDs set.
 */
async function fetchTierConfigFromDB(tier: TierSlug): Promise<{
  stripe_price_id: string | null;
  stripe_extra_seat_price_id: string | null;
} | null> {
  const supabase = getSystemClient();
  const { data, error } = await supabase
    .from('tier_config')
    .select('stripe_price_id, stripe_extra_seat_price_id')
    .eq('tier', tier)
    .maybeSingle();

  if (error || !data) {
    console.error('[stripe/subscription] Failed to fetch tier_config:', error?.message);
    return null;
  }
  return data;
}

/** Shape returned by fetchWorkspace — includes columns not yet in generated types. */
interface WorkspaceBillingRow {
  id: string;
  name: string | null;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_tier: string | null;
  extra_seats: number | null;
  billing_status: string | null;
}

/**
 * Fetch workspace billing fields.
 * Uses `as any` because extra_seats, billing_status are added by the tier
 * migration and not yet in the generated Supabase types.
 */
async function fetchWorkspace(workspaceId: string): Promise<WorkspaceBillingRow> {
  const supabase = getSystemClient();
  const { data, error } = await supabase
    .from('workspaces')
    .select('id, name, stripe_customer_id, stripe_subscription_id, subscription_tier, extra_seats, billing_status')
    .eq('id', workspaceId)
    .maybeSingle();

  if (error || !data) {
    throw new Error(`Workspace not found: ${workspaceId}`);
  }
  return data as WorkspaceBillingRow;
}

// ─── Customer ──────────────────────────────────────────────────────────────────

/**
 * Gets or creates a Stripe Customer for a workspace.
 * Stores the customer ID on the workspace row if newly created.
 */
export async function createOrGetStripeCustomer(workspaceId: string): Promise<string> {
  const workspace = await fetchWorkspace(workspaceId);

  if (workspace.stripe_customer_id) {
    return workspace.stripe_customer_id;
  }

  const stripe = requireStripe();

  const customer = await stripe.customers.create({
    name: workspace.name ?? undefined,
    metadata: { workspace_id: workspaceId },
  });

  // Atomic conditional update — only set if still null to prevent TOCTOU race
  const supabase = getSystemClient();
  const { data: updated, error } = await supabase
    .from('workspaces')
    .update({ stripe_customer_id: customer.id })
    .eq('id', workspaceId)
    .is('stripe_customer_id', null)
    .select('stripe_customer_id')
    .maybeSingle();

  if (error) {
    console.error('[stripe/subscription] Failed to store stripe_customer_id:', error.message);
    throw new Error('Failed to store Stripe customer ID');
  }

  if (!updated) {
    // Another concurrent request beat us — delete the orphan and use the existing one
    await stripe.customers.del(customer.id);
    const ws = await fetchWorkspace(workspaceId);
    return ws.stripe_customer_id!;
  }

  return customer.id;
}

// ─── Create Subscription ───────────────────────────────────────────────────────

/**
 * Creates a new Stripe subscription for a workspace on the given tier.
 * If billing is disabled, performs a bare DB update only.
 */
export async function createSubscription(
  workspaceId: string,
  tier: TierSlug,
): Promise<{ subscriptionId: string | null; ok: boolean; error?: string }> {
  const supabase = getSystemClient();

  if (!isBillingEnabled()) {
    // Bare DB update — no Stripe calls
    const { error } = await supabase
      .from('workspaces')
      .update({ subscription_tier: tier } as any)
      .eq('id', workspaceId);

    if (error) return { subscriptionId: null, ok: false, error: error.message };
    return { subscriptionId: null, ok: true };
  }

  try {
    const customerId = await createOrGetStripeCustomer(workspaceId);
    const tierConfig = await fetchTierConfigFromDB(tier);

    if (!tierConfig?.stripe_price_id) {
      return { subscriptionId: null, ok: false, error: `No Stripe price configured for tier: ${tier}` };
    }

    const stripe = requireStripe();

    const subscription = await stripe.subscriptions.create({
      customer: customerId,
      items: [{ price: tierConfig.stripe_price_id, quantity: 1 }],
      metadata: { workspace_id: workspaceId },
      payment_behavior: 'default_incomplete',
      payment_settings: { save_default_payment_method: 'on_subscription' },
      expand: ['latest_invoice.payment_intent'],
    });

    // Store subscription ID and tier on workspace
    const { error } = await supabase
      .from('workspaces')
      .update({
        stripe_subscription_id: subscription.id,
        subscription_tier: tier,
        billing_status: 'active',
      } as any)
      .eq('id', workspaceId);

    if (error) {
      console.error('[stripe/subscription] Failed to store subscription:', error.message);
    }

    return { subscriptionId: subscription.id, ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to create subscription';
    console.error('[stripe/subscription] createSubscription error:', message);
    return { subscriptionId: null, ok: false, error: message };
  }
}

// ─── Update Subscription Tier ──────────────────────────────────────────────────

/**
 * Changes an existing subscription to a new tier with proration.
 * If billing is disabled, performs a bare DB update only.
 */
export async function updateSubscriptionTier(
  workspaceId: string,
  newTier: TierSlug,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSystemClient();

  if (!isBillingEnabled()) {
    const { error } = await supabase
      .from('workspaces')
      .update({ subscription_tier: newTier } as any)
      .eq('id', workspaceId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  try {
    const workspace = await fetchWorkspace(workspaceId);

    if (!workspace.stripe_subscription_id) {
      return { ok: false, error: 'No active subscription to update' };
    }

    const tierConfig = await fetchTierConfigFromDB(newTier);
    if (!tierConfig?.stripe_price_id) {
      return { ok: false, error: `No Stripe price configured for tier: ${newTier}` };
    }

    const stripe = requireStripe();
    const subscription = await stripe.subscriptions.retrieve(workspace.stripe_subscription_id);

    // Find the base price item by matching the current tier's price ID (deterministic).
    // Falls back to the extra-seat exclusion heuristic if current tier config is unavailable.
    const currentTier = (workspace as any).subscription_tier as TierSlug | undefined;
    const currentTierConfig = currentTier ? await fetchTierConfigFromDB(currentTier) : null;

    let baseItem = currentTierConfig?.stripe_price_id
      ? subscription.items.data.find((item) => item.price.id === currentTierConfig.stripe_price_id)
      : null;

    if (!baseItem) {
      // Fallback: exclude the extra-seat price and take the remaining item
      const extraSeatPriceId = currentTierConfig?.stripe_extra_seat_price_id;
      baseItem = subscription.items.data.find((item) => item.price.id !== extraSeatPriceId) ?? null;
    }

    if (!baseItem) {
      return { ok: false, error: 'Could not find base subscription item' };
    }

    await stripe.subscriptions.update(workspace.stripe_subscription_id, {
      items: [
        {
          id: baseItem.id,
          price: tierConfig.stripe_price_id,
        },
      ],
      proration_behavior: 'create_prorations',
      metadata: { workspace_id: workspaceId },
    });

    // Update tier in DB
    const { error } = await supabase
      .from('workspaces')
      .update({ subscription_tier: newTier } as any)
      .eq('id', workspaceId);

    if (error) {
      console.error('[stripe/subscription] Failed to update tier in DB:', error.message);
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update subscription tier';
    console.error('[stripe/subscription] updateSubscriptionTier error:', message);
    return { ok: false, error: message };
  }
}

// ─── Update Seat Quantity ──────────────────────────────────────────────────────

/**
 * Updates the extra seat line item on the workspace's subscription.
 * If billing is disabled, performs a bare DB update only.
 */
export async function updateSeatQuantity(
  workspaceId: string,
  extraSeats: number,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSystemClient();

  // Always update DB
  const { error: dbError } = await supabase
    .from('workspaces')
    .update({ extra_seats: extraSeats } as any)
    .eq('id', workspaceId);

  if (dbError) {
    return { ok: false, error: dbError.message };
  }

  if (!isBillingEnabled()) {
    return { ok: true };
  }

  try {
    const workspace = await fetchWorkspace(workspaceId);

    if (!workspace.stripe_subscription_id) {
      return { ok: true }; // DB updated, no subscription to sync
    }

    const tierConfig = await fetchTierConfigFromDB(
      (workspace.subscription_tier as TierSlug) ?? 'foundation',
    );

    if (!tierConfig?.stripe_extra_seat_price_id) {
      return { ok: true }; // No extra seat price configured, DB already updated
    }

    const stripe = requireStripe();
    const subscription = await stripe.subscriptions.retrieve(workspace.stripe_subscription_id);

    // Find existing extra-seat item
    const seatItem = subscription.items.data.find(
      (item) => item.price.id === tierConfig.stripe_extra_seat_price_id,
    );

    if (seatItem) {
      if (extraSeats === 0) {
        // Remove the line item
        await stripe.subscriptionItems.del(seatItem.id, { proration_behavior: 'create_prorations' });
      } else {
        // Update quantity
        await stripe.subscriptionItems.update(seatItem.id, {
          quantity: extraSeats,
          proration_behavior: 'create_prorations',
        });
      }
    } else if (extraSeats > 0) {
      // Add a new line item for extra seats
      await stripe.subscriptionItems.create({
        subscription: workspace.stripe_subscription_id,
        price: tierConfig.stripe_extra_seat_price_id,
        quantity: extraSeats,
        proration_behavior: 'create_prorations',
      });
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to update seat quantity';
    console.error('[stripe/subscription] updateSeatQuantity error:', message);
    // DB was already updated, so return partial success
    return { ok: true, error: `DB updated but Stripe sync failed: ${message}` };
  }
}

// ─── Cancel Subscription ───────────────────────────────────────────────────────

/**
 * Cancels the workspace's subscription at the end of the current billing period.
 * If billing is disabled, sets billing_status to 'canceled' immediately.
 */
export async function cancelSubscription(
  workspaceId: string,
): Promise<{ ok: boolean; error?: string }> {
  const supabase = getSystemClient();

  if (!isBillingEnabled()) {
    const { error } = await supabase
      .from('workspaces')
      .update({
        billing_status: 'canceling',
        subscription_tier: 'foundation',
      } as any)
      .eq('id', workspaceId);

    if (error) return { ok: false, error: error.message };
    return { ok: true };
  }

  try {
    const workspace = await fetchWorkspace(workspaceId);

    if (!workspace.stripe_subscription_id) {
      return { ok: false, error: 'No active subscription to cancel' };
    }

    const stripe = requireStripe();

    await stripe.subscriptions.update(workspace.stripe_subscription_id, {
      cancel_at_period_end: true,
    });

    const { error } = await supabase
      .from('workspaces')
      .update({ billing_status: 'canceling' } as any)
      .eq('id', workspaceId);

    if (error) {
      console.error('[stripe/subscription] Failed to update billing_status:', error.message);
    }

    return { ok: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to cancel subscription';
    console.error('[stripe/subscription] cancelSubscription error:', message);
    return { ok: false, error: message };
  }
}

// ─── Get Subscription Status ───────────────────────────────────────────────────

/**
 * Returns the current Stripe subscription status for a workspace.
 * If billing is disabled, returns the DB billing_status.
 */
export async function getSubscriptionStatus(
  workspaceId: string,
): Promise<{
  status: string;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
}> {
  const workspace = await fetchWorkspace(workspaceId);

  if (!isBillingEnabled() || !workspace.stripe_subscription_id) {
    return {
      status: (workspace.billing_status as string) ?? 'active',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }

  try {
    const stripe = requireStripe();
    const subscription = await stripe.subscriptions.retrieve(workspace.stripe_subscription_id);

    // In Stripe API 2026-02-25.clover, current_period_end is per-item, not per-subscription.
    // Use the first item's period end as a proxy for the subscription period.
    const firstItem = subscription.items.data[0];
    const periodEnd = firstItem?.current_period_end
      ? new Date(firstItem.current_period_end * 1000).toISOString()
      : null;

    return {
      status: subscription.status,
      currentPeriodEnd: periodEnd,
      cancelAtPeriodEnd: subscription.cancel_at_period_end,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to fetch subscription';
    console.error('[stripe/subscription] getSubscriptionStatus error:', message);
    return {
      status: (workspace.billing_status as string) ?? 'unknown',
      currentPeriodEnd: null,
      cancelAtPeriodEnd: false,
    };
  }
}
