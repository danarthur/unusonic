'use server';

/**
 * Finance feature – Create or retrieve a Stripe PaymentIntent for a proposal deposit.
 * Uses system client (no user session — token is the only identity proof).
 * Proposal must be in `accepted` status before an intent is created.
 * Idempotent: reuses the existing intent ID stored on the proposal row.
 * @module features/finance/api/create-proposal-deposit-intent
 */

import 'server-only';

import { getSystemClient } from '@/shared/api/supabase/system';
import { getStripe } from '@/shared/api/stripe/server';
import { calculateDepositTotal, calculateDepositCents } from '../lib/calculate-deposit';

export interface CreateDepositIntentResult {
  clientSecret: string | null;
  error?: string;
  alreadyPaid?: boolean;
}

export async function createProposalDepositIntent(
  token: string
): Promise<CreateDepositIntentResult> {
  if (!token?.trim()) return { clientSecret: null, error: 'Invalid token' };

  const supabase = getSystemClient();

  // Fetch the proposal — only proceed if status is 'accepted'
  const { data: proposal } = await supabase
    .from('proposals')
    .select('id, status, deposit_percent, stripe_payment_intent_id, deposit_paid_at')
    .eq('public_token', token.trim())
    .eq('status', 'accepted')
    .maybeSingle();

  if (!proposal) return { clientSecret: null, error: 'Proposal not found or not yet signed' };

  const p = proposal as {
    id: string;
    status: string;
    deposit_percent: number | null;
    stripe_payment_intent_id: string | null;
    deposit_paid_at: string | null;
  };

  if (p.deposit_paid_at) {
    return { clientSecret: null, alreadyPaid: true };
  }

  const depositPercent = p.deposit_percent;
  if (!depositPercent || depositPercent <= 0) {
    return { clientSecret: null, error: 'No deposit required for this proposal' };
  }

  // Compute the total from proposal_items (same formula as getPublicProposal)
  const { data: items } = await supabase
    .from('proposal_items')
    .select('id, quantity, unit_price, override_price, unit_multiplier, is_optional, is_client_visible')
    .eq('proposal_id', p.id);

  const itemList = (items ?? []) as {
    id: string;
    quantity: number | null;
    unit_price: number;
    override_price: number | null;
    unit_multiplier: number | null;
    is_optional: boolean | null;
    is_client_visible: boolean | null;
  }[];

  // Fetch client selections so optional items that were deselected are excluded —
  // must match getPublicProposal's total exactly.
  const { data: selectionsRows } = await supabase
    .from('proposal_client_selections')
    .select('item_id, selected')
    .eq('proposal_id', p.id);
  const selectionsMap = new Map((selectionsRows ?? []).map((s) => [s.item_id, s.selected]));

  const total = calculateDepositTotal(itemList, selectionsMap);
  const depositCents = calculateDepositCents(total, depositPercent);

  if (depositCents <= 0) return { clientSecret: null, error: 'Deposit amount is zero' };

  const stripe = getStripe();
  if (!stripe) return { clientSecret: null, error: 'Stripe not configured' };

  // Idempotent: reuse existing intent if already created
  if (p.stripe_payment_intent_id) {
    try {
      const existing = await stripe.paymentIntents.retrieve(p.stripe_payment_intent_id);
      if (existing.status === 'succeeded') {
        // Webhook may not have fired yet — mark deposit_paid_at now
        await supabase
          .from('proposals')
          .update({ deposit_paid_at: new Date().toISOString() })
          .eq('id', p.id);
        return { clientSecret: null, alreadyPaid: true };
      }
      if (existing.client_secret) {
        return { clientSecret: existing.client_secret };
      }
    } catch {
      // Intent not found in Stripe — fall through to create a new one
    }
  }

  // Create a new PaymentIntent
  let intent;
  try {
    intent = await stripe.paymentIntents.create({
      amount: depositCents,
      currency: 'usd',
      metadata: {
        proposal_id: p.id,
        public_token: token.trim(),
        type: 'proposal_deposit',
      },
      automatic_payment_methods: { enabled: true },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Stripe payment intent creation failed';
    return { clientSecret: null, error: message };
  }

  // Persist the intent ID for idempotency on subsequent calls
  await supabase
    .from('proposals')
    .update({ stripe_payment_intent_id: intent.id })
    .eq('id', p.id);

  return { clientSecret: intent.client_secret ?? null };
}
