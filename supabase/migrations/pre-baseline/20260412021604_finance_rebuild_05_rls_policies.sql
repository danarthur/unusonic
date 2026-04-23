-- =============================================================================
-- Finance Rebuild — Migration 5 of 5: RLS Policies
--
-- Enables RLS on every finance table and writes the workspace-isolation
-- policies. The pattern matches CLAUDE.md §RLS-patterns for finance schema:
--   workspace_id IN (SELECT get_my_workspace_ids())
--
-- Special cases:
--   - finance.invoices: anon SELECT is DENIED. Public reads route through
--     finance.get_public_invoice(token) RPC only.
--   - finance.payments, finance.bills, finance.bill_payments, finance.qbo_*:
--     standard workspace-scoped policies. Writes for tokens go through
--     SECURITY DEFINER functions that bypass RLS.
--   - finance.stripe_webhook_events: deny-all for session client; only the
--     webhook handler (service_role) writes.
--   - finance.invoice_number_sequences: workspace-scoped read; writes only
--     via finance.next_invoice_number RPC.
--
-- Service role bypasses all RLS by Supabase default. The system client
-- (src/shared/api/supabase/system.ts) is the only place service role lives.
-- =============================================================================

BEGIN;

-- ===========================================================================
-- finance.invoices
-- ===========================================================================
ALTER TABLE finance.invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.invoices FORCE ROW LEVEL SECURITY;

CREATE POLICY invoices_select ON finance.invoices
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY invoices_insert ON finance.invoices
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY invoices_update ON finance.invoices
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY invoices_delete ON finance.invoices
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- Explicitly DENY anon. Public reads go through finance.get_public_invoice RPC.

-- ===========================================================================
-- finance.invoice_line_items
-- ===========================================================================
ALTER TABLE finance.invoice_line_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.invoice_line_items FORCE ROW LEVEL SECURITY;

CREATE POLICY invoice_line_items_select ON finance.invoice_line_items
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY invoice_line_items_insert ON finance.invoice_line_items
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY invoice_line_items_update ON finance.invoice_line_items
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY invoice_line_items_delete ON finance.invoice_line_items
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- ===========================================================================
-- finance.payments
-- ===========================================================================
ALTER TABLE finance.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.payments FORCE ROW LEVEL SECURITY;

-- Read: workspace members can see payments for their workspace.
CREATE POLICY payments_select ON finance.payments
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- Writes happen through finance.record_payment RPC (SECURITY DEFINER, service role).
-- No INSERT/UPDATE/DELETE policies for authenticated — direct writes are blocked.
-- This enforces the "single canonical write path" rule.

-- ===========================================================================
-- finance.qbo_connections — read-only for authenticated, writes via RPC
-- ===========================================================================
ALTER TABLE finance.qbo_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.qbo_connections FORCE ROW LEVEL SECURITY;

CREATE POLICY qbo_connections_select ON finance.qbo_connections
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- Column-level deny on token-related columns for authenticated.
REVOKE ALL ON TABLE finance.qbo_connections FROM authenticated;
GRANT SELECT (
  id, workspace_id, realm_id, environment, status,
  access_token_expires_at, refresh_token_expires_at, last_refreshed_at,
  default_item_ids, default_tax_code_id,
  default_income_account_id, default_deposit_account_id,
  connected_by_user_id, connected_at, last_sync_at, last_sync_error,
  created_at, updated_at
) ON finance.qbo_connections TO authenticated;
-- Note: access_token_secret_id and refresh_token_secret_id are NOT granted.
-- Only service_role and SECURITY DEFINER functions can read them.

-- ===========================================================================
-- finance.qbo_entity_map
-- ===========================================================================
ALTER TABLE finance.qbo_entity_map ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.qbo_entity_map FORCE ROW LEVEL SECURITY;

CREATE POLICY qbo_entity_map_select ON finance.qbo_entity_map
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- Writes via SECURITY DEFINER functions only (mapping resolution, sync worker).

-- ===========================================================================
-- finance.qbo_sync_log — read-only audit; writes via service_role only
-- ===========================================================================
ALTER TABLE finance.qbo_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.qbo_sync_log FORCE ROW LEVEL SECURITY;

CREATE POLICY qbo_sync_log_select ON finance.qbo_sync_log
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- ===========================================================================
-- finance.sync_jobs — visible to workspace, writes via worker
-- ===========================================================================
ALTER TABLE finance.sync_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.sync_jobs FORCE ROW LEVEL SECURITY;

CREATE POLICY sync_jobs_select ON finance.sync_jobs
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- ===========================================================================
-- finance.tax_rates
-- ===========================================================================
ALTER TABLE finance.tax_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.tax_rates FORCE ROW LEVEL SECURITY;

CREATE POLICY tax_rates_select ON finance.tax_rates
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY tax_rates_insert ON finance.tax_rates
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY tax_rates_update ON finance.tax_rates
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

-- ===========================================================================
-- finance.stripe_webhook_events — fully denied to session clients
-- ===========================================================================
ALTER TABLE finance.stripe_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.stripe_webhook_events FORCE ROW LEVEL SECURITY;

-- No policies = no access for authenticated/anon.
-- Only service_role (webhook handler) can read/write.
-- Revoke any default grants to be explicit.
REVOKE ALL ON TABLE finance.stripe_webhook_events FROM authenticated, anon;

-- ===========================================================================
-- finance.invoice_number_sequences — workspace-scoped read, writes via RPC
-- ===========================================================================
ALTER TABLE finance.invoice_number_sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.invoice_number_sequences FORCE ROW LEVEL SECURITY;

CREATE POLICY invoice_number_sequences_select ON finance.invoice_number_sequences
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- Writes only via finance.next_invoice_number RPC (SECURITY DEFINER, service role).

-- ===========================================================================
-- finance.bills
-- ===========================================================================
ALTER TABLE finance.bills ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bills FORCE ROW LEVEL SECURITY;

CREATE POLICY bills_select ON finance.bills
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY bills_insert ON finance.bills
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY bills_update ON finance.bills
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY bills_delete ON finance.bills
  FOR DELETE TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- ===========================================================================
-- finance.bill_payments
-- ===========================================================================
ALTER TABLE finance.bill_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE finance.bill_payments FORCE ROW LEVEL SECURITY;

CREATE POLICY bill_payments_select ON finance.bill_payments
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY bill_payments_insert ON finance.bill_payments
  FOR INSERT TO authenticated
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY bill_payments_update ON finance.bill_payments
  FOR UPDATE TO authenticated
  USING (workspace_id IN (SELECT get_my_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

-- ===========================================================================
-- Grants — service role gets full access to every finance table
-- ===========================================================================
GRANT USAGE ON SCHEMA finance TO service_role;
GRANT ALL ON ALL TABLES IN SCHEMA finance TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA finance TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA finance TO service_role;

-- Authenticated gets schema USAGE but only the column grants we explicitly set above.
GRANT USAGE ON SCHEMA finance TO authenticated;

-- Default privileges so future objects in finance get the same posture.
ALTER DEFAULT PRIVILEGES IN SCHEMA finance
  GRANT ALL ON TABLES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance
  GRANT ALL ON SEQUENCES TO service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA finance
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ===========================================================================
-- Sanity checks — every table has RLS enabled
-- ===========================================================================
DO $$
DECLARE
  v_total int;
  v_with_rls int;
  v_no_rls text[];
BEGIN
  SELECT count(*) INTO v_total
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'finance' AND c.relkind = 'r';

  SELECT count(*) INTO v_with_rls
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'finance' AND c.relkind = 'r' AND c.relrowsecurity;

  IF v_total <> v_with_rls THEN
    SELECT array_agg(c.relname) INTO v_no_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'finance' AND c.relkind = 'r' AND NOT c.relrowsecurity;

    RAISE EXCEPTION 'Finance tables without RLS enabled: %', v_no_rls;
  END IF;

  -- Confirm anon has zero policies on finance.invoices (public reads via RPC only)
  IF EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'finance' AND tablename = 'invoices' AND 'anon' = ANY(roles)
  ) THEN
    RAISE EXCEPTION 'finance.invoices has a policy granted to anon — should be RPC-only access';
  END IF;
END $$;

COMMIT;
