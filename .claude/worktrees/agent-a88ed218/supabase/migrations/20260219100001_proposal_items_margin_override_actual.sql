-- Margin Guardrails: proposal_items get override_price (what we charge this client) and actual_cost (what we pay for this event).
-- Run only when public.proposal_items exists.

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'proposal_items') THEN
    ALTER TABLE public.proposal_items
      ADD COLUMN IF NOT EXISTS override_price numeric CHECK (override_price IS NULL OR override_price >= 0),
      ADD COLUMN IF NOT EXISTS actual_cost numeric CHECK (actual_cost IS NULL OR actual_cost >= 0);

    COMMENT ON COLUMN public.proposal_items.override_price IS 'Price actually charged this client (negotiated); falls back to unit_price when null.';
    COMMENT ON COLUMN public.proposal_items.actual_cost IS 'Actual cost for this event (e.g. talent agreed to lower payout); used for margin calc.';
  END IF;
END $$;
