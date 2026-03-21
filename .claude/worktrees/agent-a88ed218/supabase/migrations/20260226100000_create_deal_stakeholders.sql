-- deal_stakeholders: Multi-party roles on a deal (Bill-To, Planner, Venue, Vendor).
-- Replaces single "Client" with a cast of characters. Links deal to Network (org or person).

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'deal_stakeholder_role') THEN
    CREATE TYPE public.deal_stakeholder_role AS ENUM ('bill_to', 'planner', 'venue_contact', 'vendor');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.deal_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.entities(id) ON DELETE CASCADE,
  role public.deal_stakeholder_role NOT NULL DEFAULT 'bill_to',
  is_primary boolean NOT NULL DEFAULT false,
  CONSTRAINT deal_stakeholders_node_check CHECK (
    (organization_id IS NOT NULL AND entity_id IS NULL)
    OR (organization_id IS NULL AND entity_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS deal_stakeholders_deal_org_unique
  ON public.deal_stakeholders (deal_id, organization_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS deal_stakeholders_deal_entity_unique
  ON public.deal_stakeholders (deal_id, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS deal_stakeholders_deal_id_idx ON public.deal_stakeholders (deal_id);
CREATE INDEX IF NOT EXISTS deal_stakeholders_organization_id_idx ON public.deal_stakeholders (organization_id) WHERE organization_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS deal_stakeholders_entity_id_idx ON public.deal_stakeholders (entity_id) WHERE entity_id IS NOT NULL;

ALTER TABLE public.deal_stakeholders ENABLE ROW LEVEL SECURITY;

-- RLS: same workspace as the deal
CREATE POLICY deal_stakeholders_select_workspace ON public.deal_stakeholders
  FOR SELECT
  USING (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY deal_stakeholders_insert_workspace ON public.deal_stakeholders
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND deal_id IN (
      SELECT id FROM public.deals
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY deal_stakeholders_update_workspace ON public.deal_stakeholders
  FOR UPDATE
  USING (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY deal_stakeholders_delete_workspace ON public.deal_stakeholders
  FOR DELETE
  USING (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

COMMENT ON TABLE public.deal_stakeholders IS 'Multi-party roles on a deal: bill_to (Bride), planner (Agency), venue_contact, vendor. Enables referral value and split invoicing.';
