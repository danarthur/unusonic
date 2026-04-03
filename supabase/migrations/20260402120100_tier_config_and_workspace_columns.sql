-- Migration 1.2: Create tier_config table + add new workspace columns
-- for seat/show limit enforcement and Aion action tracking.

BEGIN;

-- ─── tier_config table ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.tier_config (
  tier          subscription_tier PRIMARY KEY,
  label         text     NOT NULL,
  base_price_cents    integer  NOT NULL,
  billing_interval    text     NOT NULL DEFAULT 'month',
  included_seats      integer  NOT NULL,
  max_active_shows    integer,            -- NULL = unlimited
  extra_seat_price_cents integer NOT NULL,
  aion_mode           text     NOT NULL DEFAULT 'passive',
  aion_monthly_actions integer,           -- NULL = unlimited within mode
  stripe_price_id     text,
  stripe_extra_seat_price_id text
);

-- Seed the three tier rows
INSERT INTO public.tier_config
  (tier, label, base_price_cents, included_seats, max_active_shows, extra_seat_price_cents, aion_mode, aion_monthly_actions)
VALUES
  ('foundation', 'Foundation', 3900,  2,    5,    1500, 'passive',     NULL),
  ('growth',     'Growth',     9900,  5,    25,   1500, 'active',      NULL),
  ('studio',     'Studio',     24900, 15,   NULL, 1200, 'autonomous',  50)
ON CONFLICT (tier) DO NOTHING;

-- RLS: read-only config table for all authenticated users
ALTER TABLE public.tier_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY tier_config_select ON public.tier_config
  FOR SELECT
  TO authenticated
  USING (true);

-- ─── New workspace columns ──────────────────────────────────────────────────

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS extra_seats          integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aion_actions_used    integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS aion_actions_reset_at timestamptz,
  ADD COLUMN IF NOT EXISTS billing_status       text        NOT NULL DEFAULT 'active';

COMMIT;
