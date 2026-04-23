-- Dual-Node Linking: allow organization + contact (entity) on same row.
-- network_node = organization (e.g. Pure Lavish), contact_node = person at that org (e.g. Sarah).

ALTER TABLE public.deal_stakeholders
  DROP CONSTRAINT IF EXISTS deal_stakeholders_node_check;

ALTER TABLE public.deal_stakeholders
  ADD CONSTRAINT deal_stakeholders_node_check CHECK (
    (organization_id IS NOT NULL AND entity_id IS NULL)
    OR (organization_id IS NULL AND entity_id IS NOT NULL)
    OR (organization_id IS NOT NULL AND entity_id IS NOT NULL)
  );

COMMENT ON COLUMN public.deal_stakeholders.organization_id IS 'Network node: the organization (e.g. Pure Lavish).';
COMMENT ON COLUMN public.deal_stakeholders.entity_id IS 'Contact node: the person at that org (e.g. Sarah). Nullable when org-only.';
