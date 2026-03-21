-- ============================================================
-- Phase 2: Event Expenses
-- Tracks actual costs against an event (vendor fees, crew pay,
-- travel, catering, equipment, etc.).
--
-- QBO-compatible: qbo_purchase_id links to a QuickBooks
-- Purchase or Bill; qbo_account_id maps to a QBO account for
-- P&L categorisation when syncing.
-- ============================================================

CREATE TABLE ops.event_expenses (
  id              uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  workspace_id    uuid        NOT NULL REFERENCES public.workspaces(id),
  event_id        uuid        NOT NULL REFERENCES ops.events(id) ON DELETE CASCADE,

  -- What the expense is
  label           text        NOT NULL,
  category        text        NOT NULL DEFAULT 'other',
    -- 'vendor' | 'talent' | 'travel' | 'equipment' | 'venue' | 'catering' | 'other'

  amount          numeric(10,2) NOT NULL DEFAULT 0,

  -- Who was paid (optional — links to directory.entities for vendors/crew)
  vendor_entity_id uuid       REFERENCES directory.entities(id) ON DELETE SET NULL,

  -- When was it paid / incurred
  paid_at         date,

  -- How was it paid (maps to QBO PaymentType)
  payment_type    text        NOT NULL DEFAULT 'other',
    -- 'bill' | 'check' | 'cash' | 'credit_card' | 'bank_transfer' | 'other'

  -- Free-text note
  note            text,

  -- QuickBooks sync fields
  qbo_purchase_id text,         -- QBO Purchase or Bill ID (null until synced)
  qbo_account_id  text,         -- QBO Account ID for P&L (e.g. "Cost of Goods Sold")
  qbo_synced_at   timestamptz,  -- Last successful sync timestamp

  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX event_expenses_event_id_idx     ON ops.event_expenses (event_id);
CREATE INDEX event_expenses_workspace_id_idx ON ops.event_expenses (workspace_id);
CREATE INDEX event_expenses_qbo_purchase_idx ON ops.event_expenses (qbo_purchase_id) WHERE qbo_purchase_id IS NOT NULL;

-- Updated-at trigger
CREATE OR REPLACE FUNCTION ops.set_event_expenses_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_event_expenses_updated_at
  BEFORE UPDATE ON ops.event_expenses
  FOR EACH ROW EXECUTE FUNCTION ops.set_event_expenses_updated_at();

-- RLS
ALTER TABLE ops.event_expenses ENABLE ROW LEVEL SECURITY;

CREATE POLICY event_expenses_workspace_select ON ops.event_expenses
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY event_expenses_workspace_insert ON ops.event_expenses
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY event_expenses_workspace_update ON ops.event_expenses
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY event_expenses_workspace_delete ON ops.event_expenses
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));
