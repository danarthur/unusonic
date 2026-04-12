-- =============================================================================
-- Finance Rebuild — Migration 1 of 5: Drop Legacy Ghost Objects
--
-- Pre-launch greenfield rebuild of the billing system. See:
--   docs/audits/billing-redesign-final-plan-2026-04-11.md
--
-- This migration removes the broken legacy artifacts so the new finance.*
-- schema can be built on a clean slate. Pre-launch verification (2026-04-11):
--   - finance.invoices: 0 rows
--   - finance.payment_reminder_log: 0 rows
--   - public.invoices, public.invoice_items, public.payments: do not exist
--   - public.finance_invoices, public.qbo_project_mappings,
--     public.transaction_allocations, public.quickbooks_connections: do not exist
--
-- The only "real" finance-shaped objects today are finance.invoices (Model B),
-- finance.payment_reminder_log, and the public.create_draft_invoice_from_proposal
-- RPC whose body targets nonexistent public.invoices / public.invoice_items.
--
-- After this migration:
--   - getEntityFinancialSummary will throw 42P01 until PR-CLIENT-7 rewires it.
--     This is fine pre-launch — no users on the read path.
--   - All `(supabase as any).from('invoices')` casts continue to compile but
--     fail at runtime. PR-FOUND-2 (Migration 2) creates the new shape.
-- =============================================================================

BEGIN;

-- 1. Drop the broken RPC. Its body INSERTs into public.invoices which does
--    not exist. Replaced in Migration 4 by finance.spawn_invoices_from_proposal.
DROP FUNCTION IF EXISTS public.create_draft_invoice_from_proposal(uuid) CASCADE;

-- 2. Drop the empty finance.invoices (Model B). It has 9 columns and was the
--    only real finance ledger row, but its shape is wrong for the rebuild
--    (no proposal_id, no event_id, no payment columns, no QBO mapping).
--    Migration 2 creates the full new shape.
DROP TABLE IF EXISTS finance.invoices CASCADE;

-- 3. Drop finance.payment_reminder_log. The audit identified this as a
--    notification log, not a ledger, and confirmed no senders call it.
--    If we need a reminder log later, it gets a fresh definition.
DROP TABLE IF EXISTS finance.payment_reminder_log CASCADE;

-- 4. Sanity check: confirm the schema is now empty of finance objects.
DO $$
DECLARE
  v_remaining int;
BEGIN
  SELECT count(*) INTO v_remaining
  FROM information_schema.tables
  WHERE table_schema = 'finance';

  IF v_remaining > 0 THEN
    RAISE EXCEPTION 'Expected finance schema to be empty after legacy drop, but found % tables', v_remaining;
  END IF;
END $$;

COMMIT;
