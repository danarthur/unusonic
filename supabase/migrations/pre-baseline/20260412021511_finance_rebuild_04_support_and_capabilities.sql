-- =============================================================================
-- Finance Rebuild — Migration 4 of 5: Support Tables + RPCs + Capabilities
--
-- Adds:
--   - finance.tax_rates: workspace-scoped tax rates with QBO mapping
--   - finance.stripe_webhook_events: Stripe webhook idempotency dedup
--   - finance.invoice_number_sequences: per-workspace invoice number allocator
--   - finance.bills, finance.bill_payments: AP side, schema-only Wave 1
--   - finance.next_invoice_number(workspace): sequence allocator RPC
--   - finance.get_public_invoice(token): public-page reader RPC
--   - finance.spawn_invoices_from_proposal(proposal_id): stub for PR-CLIENT-1
--   - finance.record_payment(...): canonical payment write path stub
--   - finance.invoice_balances: replaces dropped balance_due STORED column
--   - 10 finance + 2 billing capabilities in ops.workspace_permissions
-- =============================================================================

BEGIN;

-- ===========================================================================
-- finance.tax_rates
-- ===========================================================================
CREATE TABLE finance.tax_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  name text NOT NULL,
  rate numeric(8,6) NOT NULL CHECK (rate >= 0 AND rate < 1),
  jurisdiction text NULL,

  qbo_tax_code_id text NULL,

  is_default boolean NOT NULL DEFAULT false,
  is_archived boolean NOT NULL DEFAULT false,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_tax_rates_workspace ON finance.tax_rates(workspace_id) WHERE NOT is_archived;
CREATE UNIQUE INDEX idx_finance_tax_rates_one_default
  ON finance.tax_rates(workspace_id) WHERE is_default AND NOT is_archived;

CREATE TRIGGER finance_tax_rates_set_updated_at
  BEFORE UPDATE ON finance.tax_rates
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

COMMENT ON TABLE finance.tax_rates IS
  'Workspace-scoped tax rates. v1 only uses is_default. Wave 2 introduces a per-invoice rate picker. public.workspaces.default_tax_rate column stays populated as the source-of-truth fallback.';

-- ===========================================================================
-- finance.stripe_webhook_events — dedup table
-- ===========================================================================
CREATE TABLE finance.stripe_webhook_events (
  stripe_event_id text PRIMARY KEY,
  source text NOT NULL CHECK (source IN ('client_billing', 'subscription')),
  event_type text NOT NULL,
  workspace_id uuid NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  received_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz NULL,
  processing_error text NULL
);

CREATE INDEX idx_finance_stripe_webhook_events_workspace ON finance.stripe_webhook_events(workspace_id) WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_finance_stripe_webhook_events_source ON finance.stripe_webhook_events(source, received_at DESC);
CREATE INDEX idx_finance_stripe_webhook_events_unprocessed ON finance.stripe_webhook_events(received_at) WHERE processed_at IS NULL;

COMMENT ON TABLE finance.stripe_webhook_events IS
  'Idempotency dedup for the split Stripe webhook routes (client-billing and subscription). PRIMARY KEY on stripe_event_id makes ON CONFLICT DO NOTHING the canonical first-line check. workspace_id resolved before insert per Critic §4c — never insert with NULL workspace_id then patch later.';

-- ===========================================================================
-- finance.invoice_number_sequences — per-workspace allocator
-- ===========================================================================
CREATE TABLE finance.invoice_number_sequences (
  workspace_id uuid PRIMARY KEY REFERENCES public.workspaces(id) ON DELETE CASCADE,
  prefix text NOT NULL DEFAULT 'INV-',
  next_value bigint NOT NULL DEFAULT 1000,
  pad_width int NOT NULL DEFAULT 4,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TRIGGER finance_invoice_number_sequences_set_updated_at
  BEFORE UPDATE ON finance.invoice_number_sequences
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

CREATE OR REPLACE FUNCTION finance.next_invoice_number(p_workspace_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, public, pg_temp
AS $$
DECLARE
  v_prefix text;
  v_next bigint;
  v_pad int;
BEGIN
  -- Atomic UPDATE...RETURNING is the simplest serialization. Under high
  -- contention we may need to add an advisory lock; for v1 this is fine.
  -- The unique index on (workspace_id, invoice_number) catches any race.
  INSERT INTO finance.invoice_number_sequences (workspace_id)
  VALUES (p_workspace_id)
  ON CONFLICT (workspace_id) DO NOTHING;

  UPDATE finance.invoice_number_sequences
  SET next_value = next_value + 1
  WHERE workspace_id = p_workspace_id
  RETURNING prefix, next_value - 1, pad_width
  INTO v_prefix, v_next, v_pad;

  RETURN v_prefix || lpad(v_next::text, v_pad, '0');
END;
$$;

REVOKE ALL ON FUNCTION finance.next_invoice_number(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.next_invoice_number(uuid) TO service_role;

-- ===========================================================================
-- finance.bills + finance.bill_payments — AP side, schema-only in Wave 1
-- ===========================================================================
CREATE TABLE finance.bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  bill_number text NOT NULL,
  bill_kind text NOT NULL DEFAULT 'freelancer'
    CHECK (bill_kind IN ('freelancer', 'vendor', 'expense_reimbursement')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'received', 'partially_paid', 'paid', 'void')),

  pay_to_entity_id uuid NOT NULL REFERENCES directory.entities(id),
  event_id uuid NULL REFERENCES ops.events(id) ON DELETE SET NULL,
  project_id uuid NULL REFERENCES ops.projects(id) ON DELETE SET NULL,

  currency text NOT NULL DEFAULT 'USD',
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,

  bill_date date NULL,
  due_date date NULL,

  notes text NULL,
  internal_notes text NULL,

  pay_to_snapshot jsonb NOT NULL DEFAULT '{"v": 1}'::jsonb,

  qbo_bill_id text NULL,
  qbo_sync_token text NULL,
  qbo_sync_status text NOT NULL DEFAULT 'not_synced',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  UNIQUE (workspace_id, bill_number)
);

CREATE TRIGGER finance_bills_set_updated_at
  BEFORE UPDATE ON finance.bills
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

CREATE TABLE finance.bill_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  bill_id uuid NOT NULL REFERENCES finance.bills(id) ON DELETE CASCADE,

  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',
  method text NOT NULL CHECK (method IN ('check', 'wire', 'ach', 'cash', 'other')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'succeeded', 'failed')),
  paid_at timestamptz NOT NULL DEFAULT now(),
  reference text NULL,
  notes text NULL,

  qbo_bill_payment_id text NULL,
  qbo_sync_status text NOT NULL DEFAULT 'not_synced',

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_bills_workspace ON finance.bills(workspace_id);
CREATE INDEX idx_finance_bills_pay_to ON finance.bills(pay_to_entity_id);
CREATE INDEX idx_finance_bill_payments_bill ON finance.bill_payments(bill_id);

CREATE TRIGGER finance_bill_payments_set_updated_at
  BEFORE UPDATE ON finance.bill_payments
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

COMMENT ON TABLE finance.bills IS
  'AP side. Schema-only in Wave 1 (no UI). Wave 2 ships freelancer pay flow. Maps to QBO Bill object — distinct from Invoice. Field Expert anti-pattern: never reuse AR table for AP.';

-- ===========================================================================
-- finance.spawn_invoices_from_proposal — STUB for PR-CLIENT-1
--
-- Migration 4 ships a stub so the column shape and idempotency contract are
-- locked in. Full implementation (line item snapshotting, deposit/final split,
-- pre-existing deposit_paid_at backfill) ships in PR-CLIENT-1.
-- ===========================================================================
CREATE OR REPLACE FUNCTION finance.spawn_invoices_from_proposal(p_proposal_id uuid)
RETURNS TABLE(invoice_id uuid, invoice_kind text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'finance.spawn_invoices_from_proposal is a stub; full implementation lands in PR-CLIENT-1'
    USING ERRCODE = 'P0003';
END;
$$;

REVOKE ALL ON FUNCTION finance.spawn_invoices_from_proposal(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.spawn_invoices_from_proposal(uuid) TO service_role;

-- ===========================================================================
-- finance.record_payment — canonical payment write path STUB for PR-CLIENT-2
-- ===========================================================================
CREATE OR REPLACE FUNCTION finance.record_payment(
  p_invoice_id uuid,
  p_amount numeric,
  p_method text,
  p_received_at timestamptz DEFAULT now(),
  p_reference text DEFAULT NULL,
  p_notes text DEFAULT NULL,
  p_stripe_payment_intent_id text DEFAULT NULL,
  p_stripe_charge_id text DEFAULT NULL,
  p_status text DEFAULT 'succeeded',
  p_recorded_by_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, public, pg_temp
AS $$
BEGIN
  RAISE EXCEPTION 'finance.record_payment is a stub; full implementation lands in PR-CLIENT-2'
    USING ERRCODE = 'P0004';
END;
$$;

REVOKE ALL ON FUNCTION finance.record_payment(uuid, numeric, text, timestamptz, text, text, text, text, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.record_payment(uuid, numeric, text, timestamptz, text, text, text, text, text, uuid) TO service_role;

-- ===========================================================================
-- finance.get_public_invoice — public-page reader RPC
--
-- The ONLY way to read finance.invoices via the anon key. RLS denies all
-- SELECT to anon. This RPC is granted EXECUTE to anon explicitly.
-- Returns a denormalized read-only shape — never the raw row.
-- ===========================================================================
CREATE OR REPLACE FUNCTION finance.get_public_invoice(p_token text)
RETURNS TABLE(
  invoice_id uuid,
  invoice_number text,
  invoice_kind text,
  status text,
  currency text,
  subtotal_amount numeric,
  discount_amount numeric,
  tax_amount numeric,
  total_amount numeric,
  paid_amount numeric,
  issue_date date,
  due_date date,
  issued_at timestamptz,
  notes_to_client text,
  po_number text,
  terms text,
  bill_to_snapshot jsonb,
  from_snapshot jsonb,
  line_items jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, public, pg_temp
STABLE
AS $$
DECLARE
  v_invoice_id uuid;
BEGIN
  -- Look up the invoice by token. Constant-time? No; the unique index
  -- gives us O(log n) which is acceptable for non-secret-equality.
  -- Tokens are 32 bytes of CSPRNG hex, so brute-force is computationally
  -- infeasible regardless of timing.
  SELECT id INTO v_invoice_id
  FROM finance.invoices
  WHERE public_token = p_token
    AND status IN ('sent', 'viewed', 'partially_paid', 'paid');

  IF v_invoice_id IS NULL THEN
    RETURN;  -- empty rowset; caller renders 404
  END IF;

  -- Mark as viewed on first access
  UPDATE finance.invoices
  SET viewed_at = COALESCE(viewed_at, now())
  WHERE id = v_invoice_id;

  RETURN QUERY
  SELECT
    i.id,
    i.invoice_number,
    i.invoice_kind,
    i.status,
    i.currency,
    i.subtotal_amount,
    i.discount_amount,
    i.tax_amount,
    i.total_amount,
    i.paid_amount,
    i.issue_date,
    i.due_date,
    i.issued_at,
    i.notes_to_client,
    i.po_number,
    i.terms,
    i.bill_to_snapshot,
    i.from_snapshot,
    COALESCE(
      (SELECT jsonb_agg(
        jsonb_build_object(
          'position', li.position,
          'description', li.description,
          'quantity', li.quantity,
          'unit_price', li.unit_price,
          'amount', li.amount,
          'item_kind', li.item_kind
        ) ORDER BY li.position
      )
      FROM finance.invoice_line_items li
      WHERE li.invoice_id = i.id),
      '[]'::jsonb
    ) AS line_items
  FROM finance.invoices i
  WHERE i.id = v_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION finance.get_public_invoice(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION finance.get_public_invoice(text) TO anon, authenticated, service_role;

COMMENT ON FUNCTION finance.get_public_invoice(text) IS
  'The ONLY public read path for finance.invoices. RLS denies all SELECT to anon — public viewing routes exclusively through this RPC. Returns denormalized read-only shape; never exposes internal_notes or QBO sync state.';

-- ===========================================================================
-- finance.invoice_balances view — replaces the dropped balance_due column
-- ===========================================================================
CREATE OR REPLACE VIEW finance.invoice_balances AS
SELECT
  i.id AS invoice_id,
  i.workspace_id,
  i.total_amount,
  i.paid_amount,
  (i.total_amount - i.paid_amount) AS balance_due,
  CASE
    WHEN i.due_date IS NULL THEN NULL
    WHEN i.status = 'paid' THEN 0
    WHEN i.due_date >= CURRENT_DATE THEN 0
    ELSE (CURRENT_DATE - i.due_date)
  END AS days_overdue
FROM finance.invoices i;

COMMENT ON VIEW finance.invoice_balances IS
  'Computes balance_due and days_overdue. Replaces the rejected STORED generated column from Visionary spec — see Critic §2b on lock contention.';

-- ===========================================================================
-- Capability rows for finance and billing
-- ===========================================================================
INSERT INTO ops.workspace_permissions (key) VALUES
  ('finance:read'),
  ('finance:write'),
  ('finance:void'),
  ('finance:refund'),
  ('finance:credit_note'),
  ('finance:see_internal_notes'),
  ('finance:manage_qbo'),
  ('finance:manage_settings'),
  ('billing:manage_subscription'),
  ('billing:view_subscription')
ON CONFLICT (key) DO NOTHING;

-- ===========================================================================
-- Sanity checks
-- ===========================================================================
DO $$
DECLARE
  v_table_count int;
  v_func_count int;
  v_cap_count int;
  v_view_count int;
BEGIN
  SELECT count(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'finance'
    AND table_name IN ('tax_rates', 'stripe_webhook_events', 'invoice_number_sequences', 'bills', 'bill_payments');
  IF v_table_count <> 5 THEN
    RAISE EXCEPTION 'Expected 5 finance support tables, found %', v_table_count;
  END IF;

  SELECT count(*) INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'finance'
    AND p.proname IN ('next_invoice_number', 'spawn_invoices_from_proposal', 'record_payment', 'get_public_invoice');
  IF v_func_count <> 4 THEN
    RAISE EXCEPTION 'Expected 4 finance support functions, found %', v_func_count;
  END IF;

  SELECT count(*) INTO v_cap_count
  FROM ops.workspace_permissions
  WHERE key LIKE 'finance:%' OR key LIKE 'billing:%';
  IF v_cap_count < 10 THEN
    RAISE EXCEPTION 'Expected at least 10 finance/billing capabilities, found %', v_cap_count;
  END IF;

  SELECT count(*) INTO v_view_count
  FROM information_schema.views
  WHERE table_schema = 'finance' AND table_name = 'invoice_balances';
  IF v_view_count <> 1 THEN
    RAISE EXCEPTION 'finance.invoice_balances view missing';
  END IF;

  -- REVOKE posture for the new internal functions (get_public_invoice is intentionally granted to anon)
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'finance'
      AND p.prosecdef
      AND p.proname IN ('next_invoice_number', 'spawn_invoices_from_proposal', 'record_payment')
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'Internal SECURITY DEFINER function in finance schema has anon EXECUTE — REVOKE missing';
  END IF;

  -- Confirm get_public_invoice IS accessible to anon (intentional)
  IF NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'finance'
      AND p.proname = 'get_public_invoice'
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'finance.get_public_invoice is not granted to anon';
  END IF;
END $$;

COMMIT;
