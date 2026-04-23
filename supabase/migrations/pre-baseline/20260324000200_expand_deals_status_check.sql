-- Expand deals.status check constraint to include contract_signed and deposit_received.
-- These are set by system flows (DocuSeal webhook, Stripe webhook) and by manual override
-- for deals handled outside the system.

ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_status_check;

ALTER TABLE public.deals
  ADD CONSTRAINT deals_status_check
  CHECK (status IN ('inquiry', 'proposal', 'contract_sent', 'contract_signed', 'deposit_received', 'won', 'lost'));
