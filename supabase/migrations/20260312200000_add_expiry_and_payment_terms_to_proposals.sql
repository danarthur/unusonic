-- Proposal expiry and payment terms
ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS expires_at timestamptz,
  ADD COLUMN IF NOT EXISTS deposit_percent integer,
  ADD COLUMN IF NOT EXISTS payment_due_days integer,
  ADD COLUMN IF NOT EXISTS payment_notes text;
