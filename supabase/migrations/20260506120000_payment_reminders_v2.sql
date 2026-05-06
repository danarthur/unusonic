-- =============================================================================
-- Payment Reminders v2 — Invoice-as-Source-of-Truth
--
-- Rebuilds the payment-reminder cadence on top of the post-rebuild finance
-- schema. The legacy cron keyed on public.proposals; this migration:
--
--   1. Recreates finance.payment_reminder_log (dropped in 2026-04-12 finance
--      rebuild, Migration 1 of 5) keyed on finance.invoices.id, not proposals.
--   2. Adds the workspace > deal > invoice opt-out hierarchy
--      (auto_reminders_enabled), with workspace as the system default ON.
--   3. Adds operator-action handoff fields on finance.invoices
--      (requires_operator_action, reminders_paused_until, reminders_paused_reason)
--      so the lobby Action surfaces after the final cadence step fires.
--   4. Defines finance.invoices_needing_reminder(p_now timestamptz), a single
--      SECURITY DEFINER RPC that returns one row per (invoice, cadence_step)
--      ready to send right now. The cron is a thin caller — all eligibility
--      logic, including workspace-tz quiet hours, weekend skip, dispute pause,
--      reply pause (5 business days), opt-out hierarchy, and the per-cadence-
--      step trigger-date math, lives here.
--
-- Cadence steps (Field Expert research, 2026-05-06):
--   Deposit invoices  (kind = 'deposit'):
--     'deposit_t_minus_7', 'deposit_t_0', 'deposit_t_plus_3', 'deposit_t_plus_7'
--   Balance invoices  (kind IN 'final', 'progress', 'standalone'):
--     'balance_t_minus_14', 'balance_t_minus_7', 'balance_t_minus_3',
--     'balance_t_0', 'balance_t_plus_1'
--
-- The cron at /api/cron/payment-reminders calls this RPC, hydrates the
-- workspace + deal + bill_to entity, sends via sendPaymentReminderEmail(),
-- writes one row to finance.payment_reminder_log per send, and on the final
-- step also flips invoices.requires_operator_action = true.
--
-- Reference:
--   - docs/research/payment-reminder-best-practices-2026-05-06.md
--   - docs/audits/billing-redesign-final-plan-2026-04-11.md (finance schema)
--   - CLAUDE.md §Database Architecture (RLS, REVOKE PUBLIC, schema discipline)
-- =============================================================================

BEGIN;

-- ===========================================================================
-- 1. finance.payment_reminder_log
-- ===========================================================================
-- Idempotency log keyed on (invoice_id, cadence_step). One row per email
-- successfully handed to Resend. The cron treats UNIQUE-violation on insert
-- as "already sent" and moves on. service_role writes (cron); workspace
-- members can read for audit / lobby surfacing.

CREATE TABLE finance.payment_reminder_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES finance.invoices(id) ON DELETE CASCADE,
  cadence_step text NOT NULL,
  email_to text NOT NULL,
  resend_message_id text NULL,
  sent_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payment_reminder_log_unique UNIQUE (invoice_id, cadence_step),
  CONSTRAINT payment_reminder_log_cadence_step_chk CHECK (cadence_step IN (
    'deposit_t_minus_7', 'deposit_t_0', 'deposit_t_plus_3', 'deposit_t_plus_7',
    'balance_t_minus_14', 'balance_t_minus_7', 'balance_t_minus_3',
    'balance_t_0', 'balance_t_plus_1'
  ))
);

CREATE INDEX payment_reminder_log_workspace_invoice_idx
  ON finance.payment_reminder_log (workspace_id, invoice_id);

ALTER TABLE finance.payment_reminder_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.payment_reminder_log FORCE ROW LEVEL SECURITY;

-- Workspace members can read their own log for audit / lobby Action surfacing.
CREATE POLICY payment_reminder_log_select ON finance.payment_reminder_log
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- No INSERT/UPDATE/DELETE policies for authenticated. Writes happen exclusively
-- from the cron route via service_role (which bypasses RLS by default), matching
-- the same posture as finance.payments.

REVOKE ALL ON TABLE finance.payment_reminder_log FROM authenticated, anon;
GRANT SELECT ON TABLE finance.payment_reminder_log TO authenticated;
GRANT ALL ON TABLE finance.payment_reminder_log TO service_role;

COMMENT ON TABLE finance.payment_reminder_log IS
  'Idempotency log for the payment-reminder cron. One row per (invoice_id, cadence_step) successfully sent. Resurrected from the 2026-04-12 finance-rebuild drop; v2 keys on invoices, not proposals.';

-- ===========================================================================
-- 2. Opt-out hierarchy
-- ===========================================================================
-- Three levels per Field Expert research §Question 6:
--   workspace.auto_reminders_enabled  (default ON, system kill switch)
--   deals.auto_reminders_enabled      (NULL = inherit from workspace)
--   invoices.auto_reminders_enabled   (NULL = inherit from deal)
-- Resolved at read time by the RPC via COALESCE(invoice, deal, workspace, true).

ALTER TABLE public.workspaces
  ADD COLUMN auto_reminders_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE public.deals
  ADD COLUMN auto_reminders_enabled boolean NULL;

ALTER TABLE finance.invoices
  ADD COLUMN auto_reminders_enabled boolean NULL;

COMMENT ON COLUMN public.workspaces.auto_reminders_enabled IS
  'Master kill-switch for the payment-reminder cadence. Default true. NULL not allowed at this level.';
COMMENT ON COLUMN public.deals.auto_reminders_enabled IS
  'Per-deal override. NULL inherits from workspace. false = no automated reminders for any invoice on this deal.';
COMMENT ON COLUMN finance.invoices.auto_reminders_enabled IS
  'Per-invoice override. NULL inherits from deal (which inherits from workspace). false = silence reminders for this specific invoice.';

-- ===========================================================================
-- 3. Operator-action handoff state on finance.invoices
-- ===========================================================================
-- Set by the cron when the final cadence step fires (deposit_t_plus_7 or
-- balance_t_plus_1). The RPC's WHERE clause excludes invoices with this flag
-- set, so the cron stops emailing automatically and the lobby Action widget
-- surfaces "Next move is yours."

ALTER TABLE finance.invoices
  ADD COLUMN requires_operator_action boolean NOT NULL DEFAULT false;

ALTER TABLE finance.invoices
  ADD COLUMN reminders_paused_until timestamptz NULL;

ALTER TABLE finance.invoices
  ADD COLUMN reminders_paused_reason text NULL;

COMMENT ON COLUMN finance.invoices.requires_operator_action IS
  'True after the final cadence step fires. Excludes the invoice from further automated reminders until cleared. Surfaces a lobby Actions pin. Reset when the operator marks paid, voids, or explicitly re-arms the cadence.';
COMMENT ON COLUMN finance.invoices.reminders_paused_until IS
  'Soft pause: cron skips the invoice while now() < this timestamp. Used by manual operator pause and (in v1.5) by inbound-reply auto-pause. NULL = not paused.';
COMMENT ON COLUMN finance.invoices.reminders_paused_reason IS
  'Optional human-readable reason ("waiting on dispute resolution", "client requested hold"). Surfaced in the lobby pin.';

CREATE INDEX invoices_pending_reminder_idx
  ON finance.invoices (workspace_id, due_date)
  WHERE status IN ('sent', 'partially_paid')
    AND requires_operator_action = false
    AND voided_at IS NULL;

COMMENT ON INDEX finance.invoices_pending_reminder_idx IS
  'Hot-path index for the payment-reminder cron eligibility scan. Partial: only invoices that could plausibly be due/overdue.';

-- ===========================================================================
-- 4. RPC: finance.invoices_needing_reminder(p_now timestamptz)
-- ===========================================================================
-- Returns one row per (invoice, cadence_step) ready to send right now.
-- All eligibility predicates live here so the cron is a thin caller.
--
-- Cadence steps emitted (text values must match the cron's CADENCE_STEPS map
-- and the payment_reminder_log.cadence_step CHECK constraint above):
--
--   Deposit invoices (invoice_kind = 'deposit'):
--     deposit_t_minus_7, deposit_t_0, deposit_t_plus_3, deposit_t_plus_7
--   Balance invoices (invoice_kind IN 'final','progress','standalone'):
--     balance_t_minus_14, balance_t_minus_7, balance_t_minus_3,
--     balance_t_0, balance_t_plus_1
--
-- Tone profile per step (matches PaymentReminderTone enum):
--   t-14, t-7  -> 'informational'
--   t-3        -> 'warm'
--   t-0        -> 'direct'
--   t+1, t+3   -> 'firm'
--   t+7        -> 'formal'  (final, deposit only)
--
-- Eligibility predicate (every row passes ALL):
--   - invoice.status IN ('sent', 'partially_paid'); not draft / void / paid
--   - due_date IS NOT NULL
--   - total_amount > paid_amount
--   - is_disputed = false
--   - reminders_paused_until IS NULL OR < p_now
--   - requires_operator_action = false
--   - COALESCE(invoice, deal, workspace) auto_reminders_enabled = true
--   - For T-X pre-due steps: issued_at + X days <= due_date  (don't fire
--     a T-30 on an invoice issued T-3)
--   - The cadence step's trigger date <= p_now
--   - workspace-local hour at p_now >= 9 AND < 10  (Q1 + Q4 send-time gate)
--   - workspace-local weekday at p_now is Mon-Fri  (Q1 weekend skip)
--   - No row in finance.payment_reminder_log for this (invoice, cadence_step)
--   - No deal-attached inbound reply within the last 5 business days  (Q7)
--
-- Output columns:
--   invoice_id    uuid
--   cadence_step  text
--   cadence_kind  text  ('deposit' | 'balance')
--   tone          text  (PaymentReminderTone string)

CREATE OR REPLACE FUNCTION finance.invoices_needing_reminder(p_now timestamptz)
RETURNS TABLE (
  invoice_id uuid,
  cadence_step text,
  cadence_kind text,
  tone text
)
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = 'finance', 'public', 'ops', 'pg_temp'
AS $$
  WITH steps(cadence_step, cadence_kind, days_offset, tone) AS (
    -- Deposit cadence
    VALUES
      ('deposit_t_minus_7', 'deposit', -7, 'informational'),
      ('deposit_t_0',       'deposit',  0, 'direct'),
      ('deposit_t_plus_3',  'deposit',  3, 'firm'),
      ('deposit_t_plus_7',  'deposit',  7, 'formal'),
    -- Balance cadence
      ('balance_t_minus_14', 'balance', -14, 'informational'),
      ('balance_t_minus_7',  'balance',  -7, 'informational'),
      ('balance_t_minus_3',  'balance',  -3, 'warm'),
      ('balance_t_0',        'balance',   0, 'direct'),
      ('balance_t_plus_1',   'balance',   1, 'firm')
  ),
  eligible_invoices AS (
    SELECT
      i.id                              AS invoice_id,
      i.workspace_id,
      i.deal_id,
      i.invoice_kind,
      i.due_date,
      COALESCE(i.issued_at, i.sent_at, i.created_at) AS issued_at,
      w.timezone                        AS workspace_tz
    FROM finance.invoices i
    JOIN public.workspaces w  ON w.id = i.workspace_id
    LEFT JOIN public.deals d  ON d.id = i.deal_id
    WHERE
      -- 'overdue' isn't a column in the schema — overdue is implied by
      -- (due_date < now AND total > paid). 'viewed' = client opened but
      -- hasn't paid; still send reminders.
      i.status IN ('sent', 'viewed', 'partially_paid')
      AND i.due_date IS NOT NULL
      AND i.total_amount > i.paid_amount
      AND i.is_disputed = false
      AND (i.reminders_paused_until IS NULL OR i.reminders_paused_until < p_now)
      AND i.requires_operator_action = false
      AND i.voided_at IS NULL
      -- Opt-out hierarchy: invoice > deal > workspace > default true.
      AND COALESCE(i.auto_reminders_enabled,
                   d.auto_reminders_enabled,
                   w.auto_reminders_enabled,
                   true) = true
      -- Workspace-local 9 AM weekday gate. Cron may run hourly; this is
      -- where each workspace gets filtered to its own send hour.
      AND extract(hour from p_now AT TIME ZONE w.timezone)::int = 9
      AND extract(isodow from p_now AT TIME ZONE w.timezone)::int BETWEEN 1 AND 5
  ),
  candidate_rows AS (
    SELECT
      ei.invoice_id,
      s.cadence_step,
      s.cadence_kind,
      s.tone,
      s.days_offset,
      ei.due_date,
      ei.issued_at,
      ei.deal_id
    FROM eligible_invoices ei
    JOIN steps s ON
      -- Match cadence to invoice kind. Deposit = 'deposit'; Balance covers
      -- everything else with a due_date that isn't draft/void/paid.
      (s.cadence_kind = 'deposit' AND ei.invoice_kind = 'deposit')
      OR
      (s.cadence_kind = 'balance' AND ei.invoice_kind IN ('final', 'progress', 'standalone'))
    WHERE
      -- Trigger date (due_date + days_offset) has already passed.
      (ei.due_date + (s.days_offset || ' days')::interval)::timestamptz <= p_now
      -- For pre-due (T-X) steps, ensure the invoice was actually issued early
      -- enough for the heads-up to be meaningful. If issued_at + |days_offset|
      -- > due_date, the operator generated this invoice late and a T-7
      -- "heads up" sent on the same day as a T-3 "soon" looks broken.
      AND (
        s.days_offset >= 0
        OR (ei.issued_at + (-s.days_offset || ' days')::interval)::date <= ei.due_date
      )
      -- Already-sent guard.
      AND NOT EXISTS (
        SELECT 1 FROM finance.payment_reminder_log prl
        WHERE prl.invoice_id = ei.invoice_id
          AND prl.cadence_step = s.cadence_step
      )
      -- Reply pause: skip if the deal has an inbound reply in the last 5
      -- business days. We approximate "business days" as 7 calendar days,
      -- which is the conservative bound: a reply on Friday plus the
      -- following Mon-Fri = 5 business days <= 7 calendar days. Cheap and
      -- correct enough for v1; v1.5 can plug in a full business-day calc.
      AND NOT EXISTS (
        SELECT 1
        FROM ops.message_threads mt
        JOIN ops.messages msg ON msg.thread_id = mt.id
        WHERE mt.deal_id = ei.deal_id
          AND msg.direction = 'inbound'
          AND msg.created_at >= p_now - INTERVAL '7 days'
      )
  )
  SELECT
    invoice_id,
    cadence_step,
    cadence_kind,
    tone
  FROM candidate_rows;
$$;

REVOKE EXECUTE ON FUNCTION finance.invoices_needing_reminder(timestamptz) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.invoices_needing_reminder(timestamptz) TO service_role;

COMMENT ON FUNCTION finance.invoices_needing_reminder(timestamptz) IS
  'Payment-reminder eligibility query. Service-role only (called from /api/cron/payment-reminders). Returns (invoice_id, cadence_step, cadence_kind, tone) rows ready to email at p_now, gated on workspace-local 9 AM Mon-Fri, opt-out hierarchy, dispute, manual pause, operator-action handoff, and 7-day inbound-reply lookback.';

COMMIT;
