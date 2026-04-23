-- =============================================================================
-- Multi-date P0 — schema additions
--
-- Introduces series + multi-day envelopes for deals. A series is a single
-- commercial unit (one deal, one pipeline row, one contract) with N shows;
-- the pipeline stays deal-shaped, operations (calendar, crew, Aion) become
-- event-shaped.
--
-- Design decisions (per the build plan + Critic review):
--   1. `rdates` on series_rule is the source of truth. The `rrule` string is a
--      human-readable label, NOT expanded in the database — see
--      src/shared/lib/series-rule.ts and _expand_series_rule migration.
--   2. `ops.deal_crew` becomes event-scoped via `event_id`. Per-series crew
--      templates live on `ops.projects.series_crew_template` (jsonb), not on
--      deal_crew rows — keeps every existing deal_crew reader working
--      unchanged (no scope column, no NULL event_id template rows).
--   3. Invoice idempotency index is partial on `status <> 'void'` so
--      void-and-respawn works without renaming the row.
--   4. `ops.projects.deal_id` is added so every deal has a project from
--      inquiry time (handover no longer has to lazily create one when a deal
--      is won); this makes promoting a singleton to a series a one-column flip
--      instead of a schema move.
-- =============================================================================

BEGIN;

-- ─── ops.projects: series metadata + deal linkage ──────────────────────────
ALTER TABLE ops.projects
  ADD COLUMN deal_id uuid,
  ADD COLUMN is_series boolean NOT NULL DEFAULT false,
  ADD COLUMN series_rule jsonb,
  ADD COLUMN series_archetype text,
  ADD COLUMN series_crew_template jsonb;

ALTER TABLE ops.projects
  ADD CONSTRAINT ops_projects_series_archetype_check
    CHECK (
      series_archetype IS NULL
      OR series_archetype IN ('residency', 'tour', 'run', 'weekend', 'custom')
    );

-- series_rule is only meaningful when is_series = true. A singleton project
-- with is_series = false must have NULL series_rule. This prevents the
-- "was-a-series, lost-the-flag" drift that would leave orphan rules.
ALTER TABLE ops.projects
  ADD CONSTRAINT ops_projects_series_rule_consistent
    CHECK (
      (is_series = true  AND series_rule IS NOT NULL)
      OR (is_series = false AND series_rule IS NULL)
    );

CREATE INDEX ops_projects_deal_id_idx
  ON ops.projects (deal_id)
  WHERE deal_id IS NOT NULL;

CREATE INDEX ops_projects_is_series_idx
  ON ops.projects (workspace_id, is_series);

-- ─── ops.events: divergence + per-show price snapshot ───────────────────────
-- diverged_from_series_at: marks an event that was edited away from its
-- series template (crew, times, venue overrides). Enables "show-me-exceptions"
-- queries without JSONB diff.
--
-- unit_price_snapshot: per-show price at the moment of spawn. For per_event
-- and monthly_rollup invoice modes, this is the line-item unit price. For
-- deposit_final/lump, it is informational only.
ALTER TABLE ops.events
  ADD COLUMN diverged_from_series_at timestamptz,
  ADD COLUMN unit_price_snapshot numeric(14, 2);

-- ─── ops.deal_crew: event-scoped crew ───────────────────────────────────────
-- Every crew row becomes event-scoped. For singletons (1 event), event_id is
-- the deal's single event. For series, each row pins to a specific show.
-- Series-wide templates live on ops.projects.series_crew_template and are
-- fanned out at "Set for whole series" click time — never as template rows
-- with NULL event_id.
ALTER TABLE ops.deal_crew
  ADD COLUMN event_id uuid REFERENCES ops.events(id) ON DELETE CASCADE;

CREATE INDEX ops_deal_crew_event_id_idx
  ON ops.deal_crew (event_id)
  WHERE event_id IS NOT NULL;

COMMENT ON COLUMN ops.deal_crew.event_id IS
  'Event-scoped crew assignment. NULL only during the pre-backfill window; every row after migration 20260421000000 must point to an event.';

-- ─── finance.invoices: billing mode + period + partial unique ───────────────
ALTER TABLE finance.invoices
  ADD COLUMN billing_mode text,
  ADD COLUMN billing_period_start date,
  ADD COLUMN billing_period_end date;

ALTER TABLE finance.invoices
  ADD CONSTRAINT finance_invoices_billing_mode_check
    CHECK (
      billing_mode IS NULL
      OR billing_mode IN ('lump', 'deposit_final', 'per_event', 'monthly_rollup')
    );

ALTER TABLE finance.invoices
  ADD CONSTRAINT finance_invoices_billing_period_consistent
    CHECK (
      (billing_period_start IS NULL AND billing_period_end IS NULL)
      OR (billing_period_start IS NOT NULL AND billing_period_end IS NOT NULL
          AND billing_period_start <= billing_period_end)
    );

-- Idempotency index keyed on (proposal, kind, event, period-start). Sentinel
-- values are used for NULLs so Postgres can enforce uniqueness:
--   - event_id NULL → sentinel zero-uuid (lump / deposit_final / monthly_rollup)
--   - billing_period_start NULL → sentinel 1900-01-01 (lump / deposit_final / per_event)
--
-- Partial on `status <> 'void'` so voiding an invoice frees the slot for a
-- respawn (e.g. owner voids the deposit and re-triggers spawn after fixing
-- a line item). Re-spawn of the same kind against a voided row is an
-- explicit retry, not idempotency.
CREATE UNIQUE INDEX finance_invoices_spawn_idem
  ON finance.invoices (
    proposal_id,
    invoice_kind,
    COALESCE(event_id, '00000000-0000-0000-0000-000000000000'::uuid),
    COALESCE(billing_period_start, '1900-01-01'::date)
  )
  WHERE proposal_id IS NOT NULL AND status <> 'void';

-- ─── public.deals: multi-day end date ───────────────────────────────────────
-- Multi-day single events store their inquiry-time range here; handoverDeal
-- reads it and writes ops.events.ends_at. Singletons leave it NULL. Series
-- leave it NULL (the end is derived from series_rule).
ALTER TABLE public.deals
  ADD COLUMN proposed_end_date date;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_proposed_end_date_check
    CHECK (proposed_end_date IS NULL OR proposed_end_date >= proposed_date);

COMMIT;
