-- =============================================================================
-- Finance Rebuild — Migration 2 of 5: Core Ledger Tables
--
-- Creates finance.invoices, finance.invoice_line_items, finance.payments,
-- the recompute_invoice_paid trigger function (concurrent-safe with FOR UPDATE),
-- and updated_at triggers. RLS is added in Migration 5.
--
-- Reference: docs/audits/billing-redesign-final-plan-2026-04-11.md §3
--
-- Key design choices documented inline:
--   - bill_to_snapshot/from_snapshot are versioned jsonb (immutable legal record)
--   - tax_rate_snapshot frozen at send time (Critic §2e)
--   - balance_due is NOT a generated column (Critic §2b — lock contention)
--   - source_proposal_item_id is lineage only, NOT FK (mutable proposal items)
--   - public_token reads route through RPC only (Migration 4); RLS denies anon
--   - recompute trigger gated on invoice_kind != 'credit_note' (Critic §2a)
--   - recompute trigger uses SELECT FOR UPDATE on invoice row (Critic §2c)
--   - invoice has many payments; payments are first-class (Field Expert)
--   - amounts in dollars (numeric(14,2)); cents only at Stripe boundary
-- =============================================================================

BEGIN;

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger function
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION finance.set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION finance.set_updated_at() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.set_updated_at() TO service_role;

-- ===========================================================================
-- finance.invoices — the core ledger row
-- ===========================================================================
CREATE TABLE finance.invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,

  -- Identity
  invoice_number text NOT NULL,
  invoice_kind text NOT NULL DEFAULT 'standalone'
    CHECK (invoice_kind IN ('deposit', 'progress', 'final', 'standalone', 'credit_note')),
  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'viewed', 'partially_paid', 'paid', 'void', 'refunded')),

  -- Relationships (the four-key debate from Navigator §5 Q1, resolved:
  -- event_id is the primary operational link; deal_id is denormalized for
  -- chain rollups; proposal_id is lineage; project_id is optional.)
  bill_to_entity_id uuid NOT NULL REFERENCES directory.entities(id),
  event_id uuid NULL REFERENCES ops.events(id) ON DELETE SET NULL,
  project_id uuid NULL REFERENCES ops.projects(id) ON DELETE SET NULL,
  proposal_id uuid NULL REFERENCES public.proposals(id) ON DELETE SET NULL,
  deal_id uuid NULL REFERENCES public.deals(id) ON DELETE SET NULL,
  parent_invoice_id uuid NULL REFERENCES finance.invoices(id) ON DELETE SET NULL,

  -- Money (dollars; cents only at Stripe boundary)
  currency text NOT NULL DEFAULT 'USD',
  subtotal_amount numeric(14,2) NOT NULL DEFAULT 0,
  discount_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_amount numeric(14,2) NOT NULL DEFAULT 0,
  tax_rate_snapshot numeric(8,6) NULL,  -- Frozen at send time (Critic §2e)
  total_amount numeric(14,2) NOT NULL DEFAULT 0,
  paid_amount numeric(14,2) NOT NULL DEFAULT 0,

  -- balance_due is intentionally NOT a generated column (Critic §2b).
  -- Compute as total_amount - paid_amount in queries or via the
  -- finance.invoice_balances view created in Migration 4.

  -- Lifecycle dates
  issue_date date NULL,
  due_date date NULL,
  issued_at timestamptz NULL,
  sent_at timestamptz NULL,
  viewed_at timestamptz NULL,
  paid_at timestamptz NULL,
  voided_at timestamptz NULL,

  -- Public access
  public_token text NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),

  -- Document content
  notes_to_client text NULL,
  internal_notes text NULL,
  po_number text NULL,  -- Critical for corporate AP (Kristen persona)
  terms text NULL,

  -- Snapshots (versioned jsonb; Zod schemas in src/features/finance/schemas/)
  -- These are legal-record snapshots — never re-resolve from current entity state.
  bill_to_snapshot jsonb NOT NULL DEFAULT '{"v": 1}'::jsonb,
  from_snapshot jsonb NOT NULL DEFAULT '{"v": 1}'::jsonb,

  -- QBO sync state (denormalized from qbo_entity_map for hot-path reads)
  qbo_invoice_id text NULL,
  qbo_sync_token text NULL,
  qbo_doc_number text NULL,
  qbo_last_sync_at timestamptz NULL,
  qbo_last_error text NULL,
  qbo_sync_status text NOT NULL DEFAULT 'not_synced'
    CHECK (qbo_sync_status IN ('not_synced', 'queued', 'in_progress', 'synced', 'failed', 'pending_mapping', 'dead_letter', 'excluded_pre_connection')),

  -- Stripe references
  stripe_payment_link_id text NULL,

  -- Email routing — Critic §9d. Default to entity primary at write time, editable per invoice.
  billing_email text NULL,

  -- Dispute workflow — Critic §9c. Orthogonal to lifecycle status.
  is_disputed boolean NOT NULL DEFAULT false,
  dispute_note text NULL,

  -- PDF versioning — Critic §5a. Path includes version so resends never silently overwrite.
  pdf_version int NOT NULL DEFAULT 0,
  pdf_last_generated_at timestamptz NULL,

  -- Audit
  created_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  sent_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),

  -- Constraints
  UNIQUE (workspace_id, invoice_number)
);

CREATE INDEX idx_finance_invoices_workspace ON finance.invoices(workspace_id);
CREATE INDEX idx_finance_invoices_bill_to ON finance.invoices(bill_to_entity_id);
CREATE INDEX idx_finance_invoices_event ON finance.invoices(event_id) WHERE event_id IS NOT NULL;
CREATE INDEX idx_finance_invoices_proposal ON finance.invoices(proposal_id) WHERE proposal_id IS NOT NULL;
CREATE INDEX idx_finance_invoices_deal ON finance.invoices(deal_id) WHERE deal_id IS NOT NULL;
CREATE INDEX idx_finance_invoices_status ON finance.invoices(workspace_id, status);
CREATE INDEX idx_finance_invoices_due_date ON finance.invoices(workspace_id, due_date) WHERE status IN ('sent', 'viewed', 'partially_paid');
CREATE INDEX idx_finance_invoices_qbo_sync_status ON finance.invoices(workspace_id, qbo_sync_status) WHERE qbo_sync_status NOT IN ('synced', 'not_synced');

CREATE TRIGGER finance_invoices_set_updated_at
  BEFORE UPDATE ON finance.invoices
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

COMMENT ON TABLE finance.invoices IS
  'Authoritative client-billing invoice ledger. One row per invoice. A deal can have many invoices (deposit + final + change orders) all rolling up to the same deal_id. Snapshots are immutable legal records — never re-resolve from current entity state.';

COMMENT ON COLUMN finance.invoices.tax_rate_snapshot IS
  'Frozen at send time. Wave 2 line item edits recompute tax_amount as new_taxable_subtotal * tax_rate_snapshot — rate frozen, base can move.';

COMMENT ON COLUMN finance.invoices.public_token IS
  'Random 32-byte hex. Powers /i/[token] public page. Reads route ONLY through finance.get_public_invoice(token) RPC (Migration 4). RLS denies anon SELECT on this table.';

-- ===========================================================================
-- finance.invoice_line_items
-- ===========================================================================
CREATE TABLE finance.invoice_line_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES finance.invoices(id) ON DELETE CASCADE,

  position int NOT NULL DEFAULT 0,
  item_kind text NOT NULL DEFAULT 'service'
    CHECK (item_kind IN ('service', 'rental', 'talent', 'fee', 'discount', 'tax_line')),

  description text NOT NULL,
  quantity numeric(14,4) NOT NULL DEFAULT 1,
  unit_price numeric(14,2) NOT NULL DEFAULT 0,
  amount numeric(14,2) NOT NULL DEFAULT 0,
  cost numeric(14,2) NULL,  -- For profitability calc

  is_taxable boolean NOT NULL DEFAULT false,

  -- Lineage only — NOT FK. Proposal items are mutable; invoice lines are
  -- legal snapshots. If the source row vanishes, the invoice line is still valid.
  source_proposal_item_id uuid NULL,
  source_package_id uuid NULL,

  -- QBO mapping
  qbo_item_id text NULL,
  qbo_tax_code_id text NULL,

  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_invoice_line_items_invoice ON finance.invoice_line_items(invoice_id, position);
CREATE INDEX idx_finance_invoice_line_items_workspace ON finance.invoice_line_items(workspace_id);

CREATE TRIGGER finance_invoice_line_items_set_updated_at
  BEFORE UPDATE ON finance.invoice_line_items
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

COMMENT ON COLUMN finance.invoice_line_items.source_proposal_item_id IS
  'Lineage reference. NOT a foreign key — proposal items are mutable and can be deleted during negotiation. Invoice lines are legal snapshots and must survive source deletion.';

-- ===========================================================================
-- finance.payments — separate entity, NOT a status column
-- ===========================================================================
CREATE TABLE finance.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL REFERENCES finance.invoices(id) ON DELETE CASCADE,

  -- Positive for payments, NEGATIVE for refunds. One sign convention.
  amount numeric(14,2) NOT NULL,
  currency text NOT NULL DEFAULT 'USD',

  method text NOT NULL
    CHECK (method IN ('stripe_card', 'stripe_ach', 'check', 'wire', 'cash', 'bill_dot_com', 'other')),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'succeeded', 'failed', 'refunded')),
  failure_reason text NULL,

  -- The date the user reports receiving the money. Defaults to now() but
  -- editable for back-dated manual entries (e.g., check that arrived Friday
  -- but only got recorded Monday).
  received_at timestamptz NOT NULL DEFAULT now(),

  reference text NULL,  -- Check #, wire confirmation, PO. Indexed for search.
  notes text NULL,
  attachment_storage_path text NULL,  -- Deposit slip, check scan

  -- Stripe — UNIQUE on payment_intent_id is the webhook idempotency guard.
  stripe_payment_intent_id text NULL UNIQUE,
  stripe_charge_id text NULL,

  -- QBO mapping
  qbo_payment_id text NULL,
  qbo_sync_token text NULL,
  qbo_last_sync_at timestamptz NULL,
  qbo_last_error text NULL,
  qbo_sync_status text NOT NULL DEFAULT 'not_synced'
    CHECK (qbo_sync_status IN ('not_synced', 'queued', 'in_progress', 'synced', 'failed', 'dead_letter', 'excluded_pre_connection')),

  -- Refund chain
  parent_payment_id uuid NULL REFERENCES finance.payments(id) ON DELETE SET NULL,

  -- Audit
  recorded_by_user_id uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_finance_payments_invoice ON finance.payments(invoice_id);
CREATE INDEX idx_finance_payments_workspace ON finance.payments(workspace_id);
CREATE INDEX idx_finance_payments_received_at ON finance.payments(workspace_id, received_at DESC);
CREATE INDEX idx_finance_payments_reference ON finance.payments(workspace_id, reference) WHERE reference IS NOT NULL;
CREATE INDEX idx_finance_payments_qbo_sync_status ON finance.payments(workspace_id, qbo_sync_status) WHERE qbo_sync_status NOT IN ('synced', 'not_synced');

CREATE TRIGGER finance_payments_set_updated_at
  BEFORE UPDATE ON finance.payments
  FOR EACH ROW EXECUTE FUNCTION finance.set_updated_at();

COMMENT ON TABLE finance.payments IS
  'First-class payment ledger. Invoices have many payments (deposit + final, partial pays, refunds as negative siblings). Never edited after creation — corrections are new rows. Sole write path is finance.record_payment() RPC defined in Migration 4.';

-- ===========================================================================
-- finance.recompute_invoice_paid — concurrent-safe trigger function (Critic §2c)
--
-- Called by trigger on finance.payments insert/update/delete. Recomputes
-- paid_amount and updates status atomically. The SELECT FOR UPDATE on the
-- invoice row prevents the Stripe-webhook-meets-manual-payment race where
-- two concurrent recomputes can flip status backwards.
-- ===========================================================================
CREATE OR REPLACE FUNCTION finance.recompute_invoice_paid(p_invoice_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, public, pg_temp
AS $$
DECLARE
  v_total numeric(14,2);
  v_paid numeric(14,2);
  v_kind text;
  v_current_status text;
BEGIN
  -- Lock the invoice row before reading. This is the fix for the
  -- "Stripe webhook + manual payment race" — without it, two trigger
  -- executions can compute their respective paid_amounts independently
  -- and the second writer can flip status backwards (paid -> partially_paid).
  SELECT total_amount, invoice_kind, status
  INTO v_total, v_kind, v_current_status
  FROM finance.invoices
  WHERE id = p_invoice_id
  FOR UPDATE;

  -- Credit notes have their own lifecycle (draft → issued → applied → void)
  -- and are not driven by the payment table. Skip recompute (Critic §2a).
  IF v_kind = 'credit_note' THEN
    RETURN;
  END IF;

  -- Sum only succeeded payments. Pending/failed/refunded do not count toward paid_amount.
  SELECT COALESCE(SUM(amount), 0)
  INTO v_paid
  FROM finance.payments
  WHERE invoice_id = p_invoice_id AND status = 'succeeded';

  UPDATE finance.invoices
  SET paid_amount = v_paid,
      status = CASE
        WHEN v_paid >= v_total AND v_total > 0 THEN 'paid'
        WHEN v_paid > 0 AND v_paid < v_total THEN 'partially_paid'
        WHEN v_paid <= 0 AND v_current_status IN ('paid', 'partially_paid') THEN 'sent'
        ELSE v_current_status  -- preserve draft/sent/viewed if no payments yet
      END,
      paid_at = CASE
        WHEN v_paid >= v_total AND v_total > 0 AND paid_at IS NULL THEN now()
        WHEN v_paid < v_total THEN NULL
        ELSE paid_at
      END
  WHERE id = p_invoice_id;
END;
$$;

REVOKE ALL ON FUNCTION finance.recompute_invoice_paid(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.recompute_invoice_paid(uuid) TO service_role;

COMMENT ON FUNCTION finance.recompute_invoice_paid(uuid) IS
  'Concurrent-safe paid_amount recompute. Uses SELECT FOR UPDATE on the invoice row to prevent the Stripe webhook + manual payment race. Skips credit notes (separate lifecycle). Called only by the payment trigger; never invoke directly from app code.';

-- Trigger function wrapper that extracts the invoice_id from NEW or OLD
CREATE OR REPLACE FUNCTION finance.payments_recompute_trigger()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = finance, public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    PERFORM finance.recompute_invoice_paid(OLD.invoice_id);
    RETURN OLD;
  ELSE
    PERFORM finance.recompute_invoice_paid(NEW.invoice_id);
    RETURN NEW;
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION finance.payments_recompute_trigger() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION finance.payments_recompute_trigger() TO service_role;

CREATE TRIGGER finance_payments_recompute_invoice
  AFTER INSERT OR UPDATE OR DELETE ON finance.payments
  FOR EACH ROW EXECUTE FUNCTION finance.payments_recompute_trigger();

-- ===========================================================================
-- Sanity check: did we get everything?
-- ===========================================================================
DO $$
DECLARE
  v_table_count int;
  v_func_count int;
BEGIN
  SELECT count(*) INTO v_table_count
  FROM information_schema.tables
  WHERE table_schema = 'finance' AND table_name IN ('invoices', 'invoice_line_items', 'payments');

  IF v_table_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 finance core tables, found %', v_table_count;
  END IF;

  SELECT count(*) INTO v_func_count
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'finance'
    AND p.proname IN ('set_updated_at', 'recompute_invoice_paid', 'payments_recompute_trigger');

  IF v_func_count <> 3 THEN
    RAISE EXCEPTION 'Expected 3 finance functions, found %', v_func_count;
  END IF;

  -- Confirm REVOKE posture: anon must NOT have EXECUTE on any new SECURITY DEFINER function.
  IF EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'finance'
      AND p.prosecdef
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  ) THEN
    RAISE EXCEPTION 'SECURITY DEFINER function in finance schema has EXECUTE granted to anon — REVOKE missing';
  END IF;
END $$;

COMMIT;
