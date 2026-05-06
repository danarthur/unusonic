-- =============================================================================
-- Payment Reminders v2 — finance.invoices_needing_reminder regression tests
--
-- Covers the eligibility predicate paths called out in the implementation
-- spec:
--   1. Workspace tz America/Los_Angeles, p_now = 2026-05-06 16:00 UTC
--      (= 09:00 PT, Wednesday) — deposit invoice due 2026-05-13
--      → emits a 'deposit_t_minus_7' row
--   2. Same setup, p_now = 2026-05-09 16:00 UTC (Saturday in PT)
--      → emits no rows
--   3. Disputed invoice → emits no rows
--   4. Per-deal opt-out = false → emits no rows
--   5. Already in payment_reminder_log for that step → emits no rows
--
-- Plus a sixth case that confirms the pre-due "issued early enough" guard.
--
-- Depends on: 00000-helpers.test.sql for test_create_user_in_workspace.
-- =============================================================================

BEGIN;
SELECT plan(7);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Re-define helpers locally (other regression tests do the same so each
-- file can run in isolation under pg_prove).
CREATE OR REPLACE FUNCTION test_create_user_in_workspace(
  p_user_id uuid, p_workspace_id uuid, p_role text DEFAULT 'owner'
) RETURNS void AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, slug, timezone)
  VALUES (p_workspace_id, 'Test WS ' || p_workspace_id::text, 'test-' || p_workspace_id::text, 'America/Los_Angeles')
  ON CONFLICT (id) DO UPDATE SET timezone = EXCLUDED.timezone;
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, created_at, updated_at, confirmation_token)
  VALUES (p_user_id, '00000000-0000-0000-0000-000000000000', p_user_id::text || '@test.local', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now(), now(), '')
  ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (p_workspace_id, p_user_id, p_role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
END; $$ LANGUAGE plpgsql;

-- ── Fixture data ──────────────────────────────────────────────────────────
-- One workspace pinned to America/Los_Angeles. One client entity. One deal.
-- One deposit invoice issued 2026-04-29 due 2026-05-13.

SELECT test_create_user_in_workspace(
  'a0000001-0000-4000-a000-000000000001'::uuid,
  'a0000000-0000-4000-a000-000000000001'::uuid
);

INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES (
  'a0000002-0000-4000-a000-000000000002'::uuid,
  'a0000000-0000-4000-a000-000000000001'::uuid,
  'company', 'Test Client Co'
);

INSERT INTO public.deals (
  id, workspace_id, title, status, organization_id
) VALUES (
  'a0000003-0000-4000-a000-000000000003'::uuid,
  'a0000000-0000-4000-a000-000000000001'::uuid,
  'Test Deal', 'inquiry',
  'a0000002-0000-4000-a000-000000000002'::uuid
);

-- Deposit invoice. issued_at 2026-04-29 (well before T-7 of due date),
-- due_date 2026-05-13. status='sent', total > paid.
INSERT INTO finance.invoices (
  id, workspace_id, bill_to_entity_id, deal_id,
  invoice_number, invoice_kind, status,
  issued_at, due_date, total_amount, paid_amount, billing_email
) VALUES (
  'a0000004-0000-4000-a000-000000000004'::uuid,
  'a0000000-0000-4000-a000-000000000001'::uuid,
  'a0000002-0000-4000-a000-000000000002'::uuid,
  'a0000003-0000-4000-a000-000000000003'::uuid,
  'TEST-DEP-001', 'deposit', 'sent',
  '2026-04-29 12:00:00+00'::timestamptz,
  '2026-05-13'::date,
  500.00, 0.00,
  'client@example.test'
);

-- ── Test 1: 09:00 PT Wednesday on T-7 → emits deposit_t_minus_7 ──────────
-- 2026-05-06 16:00 UTC == 2026-05-06 09:00 America/Los_Angeles. Wednesday.
SELECT ok(
  EXISTS (
    SELECT 1
    FROM finance.invoices_needing_reminder('2026-05-06 16:00:00+00'::timestamptz)
    WHERE invoice_id = 'a0000004-0000-4000-a000-000000000004'::uuid
      AND cadence_step = 'deposit_t_minus_7'
      AND cadence_kind = 'deposit'
      AND tone = 'informational'
  ),
  'Wed 09:00 PT on T-7: emits deposit_t_minus_7 row'
);

-- ── Test 2: Saturday at 09:00 PT → no rows ──────────────────────────────
-- 2026-05-09 16:00 UTC == 2026-05-09 09:00 PT. Saturday.
SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM finance.invoices_needing_reminder('2026-05-09 16:00:00+00'::timestamptz)
    WHERE invoice_id = 'a0000004-0000-4000-a000-000000000004'::uuid
  ),
  'Sat 09:00 PT on T-4: weekend skip emits no rows'
);

-- ── Test 3: Disputed invoice → no rows ──────────────────────────────────
UPDATE finance.invoices
  SET is_disputed = true
  WHERE id = 'a0000004-0000-4000-a000-000000000004'::uuid;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM finance.invoices_needing_reminder('2026-05-06 16:00:00+00'::timestamptz)
    WHERE invoice_id = 'a0000004-0000-4000-a000-000000000004'::uuid
  ),
  'Disputed invoice: emits no rows'
);

UPDATE finance.invoices
  SET is_disputed = false
  WHERE id = 'a0000004-0000-4000-a000-000000000004'::uuid;

-- ── Test 4: Per-deal opt-out = false → no rows ──────────────────────────
UPDATE public.deals
  SET auto_reminders_enabled = false
  WHERE id = 'a0000003-0000-4000-a000-000000000003'::uuid;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM finance.invoices_needing_reminder('2026-05-06 16:00:00+00'::timestamptz)
    WHERE invoice_id = 'a0000004-0000-4000-a000-000000000004'::uuid
  ),
  'Per-deal opt-out = false: emits no rows even though workspace defaults to true'
);

UPDATE public.deals
  SET auto_reminders_enabled = NULL
  WHERE id = 'a0000003-0000-4000-a000-000000000003'::uuid;

-- ── Test 5: Already-logged step → no rows ───────────────────────────────
INSERT INTO finance.payment_reminder_log (
  workspace_id, invoice_id, cadence_step, email_to
) VALUES (
  'a0000000-0000-4000-a000-000000000001'::uuid,
  'a0000004-0000-4000-a000-000000000004'::uuid,
  'deposit_t_minus_7',
  'client@example.test'
);

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM finance.invoices_needing_reminder('2026-05-06 16:00:00+00'::timestamptz)
    WHERE invoice_id = 'a0000004-0000-4000-a000-000000000004'::uuid
      AND cadence_step = 'deposit_t_minus_7'
  ),
  'Already-logged step: emits no row for that step'
);

-- ── Test 6: requires_operator_action = true → no rows ───────────────────
DELETE FROM finance.payment_reminder_log
  WHERE invoice_id = 'a0000004-0000-4000-a000-000000000004'::uuid;

UPDATE finance.invoices
  SET requires_operator_action = true
  WHERE id = 'a0000004-0000-4000-a000-000000000004'::uuid;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM finance.invoices_needing_reminder('2026-05-06 16:00:00+00'::timestamptz)
    WHERE invoice_id = 'a0000004-0000-4000-a000-000000000004'::uuid
  ),
  'requires_operator_action = true: emits no rows (handoff to human respected)'
);

UPDATE finance.invoices
  SET requires_operator_action = false
  WHERE id = 'a0000004-0000-4000-a000-000000000004'::uuid;

-- ── Test 7: Pre-due "issued early enough" guard ─────────────────────────
-- Set issued_at to 1 day before due_date. Now T-7 should NOT emit because
-- issued_at + 7 days > due_date.
UPDATE finance.invoices
  SET issued_at = '2026-05-12 12:00:00+00'::timestamptz
  WHERE id = 'a0000004-0000-4000-a000-000000000004'::uuid;

SELECT ok(
  NOT EXISTS (
    SELECT 1
    FROM finance.invoices_needing_reminder('2026-05-06 16:00:00+00'::timestamptz)
    WHERE invoice_id = 'a0000004-0000-4000-a000-000000000004'::uuid
      AND cadence_step = 'deposit_t_minus_7'
  ),
  'Pre-due guard: invoice issued T-1 does not emit T-7 step'
);

-- Restore.
UPDATE finance.invoices
  SET issued_at = '2026-04-29 12:00:00+00'::timestamptz
  WHERE id = 'a0000004-0000-4000-a000-000000000004'::uuid;

SELECT * FROM finish();
ROLLBACK;
