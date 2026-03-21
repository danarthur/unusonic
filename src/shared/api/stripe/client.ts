/**
 * Stripe client singleton — loads publishable key for browser use.
 * Returns null when NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY is not set.
 * @module shared/api/stripe/client
 */

import { loadStripe, type Stripe } from '@stripe/stripe-js';

let stripePromise: Promise<Stripe | null> | null = null;

export function getStripeClient(): Promise<Stripe | null> {
  const key = process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY;
  if (!key) return Promise.resolve(null);

  if (!stripePromise) {
    stripePromise = loadStripe(key);
  }

  return stripePromise;
}
