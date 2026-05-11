-- Add missing GRANTs for the `authenticated` role on finance.* tables.
--
-- Background: in dev (and presumably prod), every finance.* table except
-- finance.referrals only granted SELECT/INSERT/UPDATE/DELETE to postgres and
-- service_role. RLS policies for the authenticated role exist on these tables,
-- but a missing table-level GRANT means PostgREST returns
--   "permission denied for table invoices"
-- before RLS even gets a chance to evaluate.
--
-- Concrete user-facing impact: /finance returns "Unable to load financial
-- data. Check your database connection." for every authenticated user.
--
-- Fix: GRANT to authenticated on every finance table that has matching RLS
-- policies. We grant the same operations the policies allow, so RLS stays
-- the only access decision point. stripe_webhook_events is intentionally
-- omitted — that table is service-role only by design.

-- Tables with full CRUD for workspace members:
GRANT SELECT, INSERT, UPDATE, DELETE ON finance.invoices            TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON finance.invoice_line_items  TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON finance.bills               TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON finance.bill_payments       TO authenticated;
GRANT SELECT, INSERT, UPDATE         ON finance.tax_rates           TO authenticated;

-- Read-only views/tables for workspace members (writes go through RPCs or
-- service-role webhooks):
GRANT SELECT ON finance.payments                 TO authenticated;
GRANT SELECT ON finance.invoice_balances         TO authenticated;
GRANT SELECT ON finance.invoice_number_sequences TO authenticated;
GRANT SELECT ON finance.qbo_connections          TO authenticated;
GRANT SELECT ON finance.qbo_entity_map           TO authenticated;
GRANT SELECT ON finance.qbo_sync_log             TO authenticated;
GRANT SELECT ON finance.sync_jobs                TO authenticated;

-- Anon needs SELECT on invoice_balances + invoices for the public-token-keyed
-- get_public_invoice RPC's surface — but get_public_invoice is SECURITY
-- DEFINER and runs as the function owner, so we deliberately do NOT grant
-- anon access here. RLS plus the existing RPC remain the only public path.
