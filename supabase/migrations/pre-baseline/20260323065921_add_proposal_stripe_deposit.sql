-- Add Stripe deposit tracking columns to proposals
-- Phase 4: Sign + Pay — inline deposit after signing

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS stripe_payment_intent_id text,
  ADD COLUMN IF NOT EXISTS deposit_paid_at timestamptz;
