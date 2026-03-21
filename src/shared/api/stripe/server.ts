/**
 * Stripe server singleton — lazy-initialized, server-only.
 * Returns null when STRIPE_SECRET_KEY is not set (dev/CI).
 * @module shared/api/stripe/server
 */

import 'server-only';

import Stripe from 'stripe';

let instance: Stripe | null = null;

export function getStripe(): Stripe | null {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) return null;

  if (!instance) {
    instance = new Stripe(key, {
      apiVersion: '2026-02-25.clover',
      typescript: true,
    });
  }

  return instance;
}
