-- Data migration: Copy deal.organization_id into deal_stakeholders as role 'bill_to'.
-- Run this ONCE after applying 20260226100000_create_deal_stakeholders.sql.
-- Safe to re-run: uses INSERT ... ON CONFLICT DO NOTHING (or skip existing).

INSERT INTO public.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
SELECT d.id, d.organization_id, NULL, 'bill_to'::public.deal_stakeholder_role, true
FROM public.deals d
WHERE d.organization_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.deal_stakeholders ds
    WHERE ds.deal_id = d.id AND ds.organization_id = d.organization_id
  );
