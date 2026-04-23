-- Move deal_stakeholders from public to ops schema.
-- Keeps public.deal_stakeholder_role enum (types are allowed in public; only new tables are forbidden).
-- RLS follows the ops pattern: get_my_workspace_ids() via deal_id → public.deals.workspace_id.

-- 1. Create ops.deal_stakeholders
CREATE TABLE IF NOT EXISTS ops.deal_stakeholders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  deal_id uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  organization_id uuid,  -- soft ref to directory.entities (resolved at app layer)
  entity_id uuid,        -- soft ref to directory.entities (FK dropped in session9; soft ref only)
  role public.deal_stakeholder_role NOT NULL DEFAULT 'bill_to',
  is_primary boolean NOT NULL DEFAULT false,
  CONSTRAINT deal_stakeholders_node_check CHECK (
    (organization_id IS NOT NULL AND entity_id IS NULL)
    OR (organization_id IS NULL AND entity_id IS NOT NULL)
    OR (organization_id IS NOT NULL AND entity_id IS NOT NULL)
  )
);

COMMENT ON TABLE ops.deal_stakeholders IS 'Multi-party roles on a deal: bill_to, planner, venue_contact, vendor. Enables referral value and split invoicing.';
COMMENT ON COLUMN ops.deal_stakeholders.organization_id IS 'Network node: the organization (e.g. Pure Lavish). Soft ref — resolved via directory.entities.legacy_org_id.';
COMMENT ON COLUMN ops.deal_stakeholders.entity_id IS 'Contact node: the person at that org (e.g. Sarah). Soft ref — resolved via directory.entities.legacy_entity_id.';

-- 2. Copy all existing data
INSERT INTO ops.deal_stakeholders (id, created_at, deal_id, organization_id, entity_id, role, is_primary)
SELECT id, created_at, deal_id, organization_id, entity_id, role::text::public.deal_stakeholder_role, is_primary
FROM public.deal_stakeholders;

-- 3. Indexes
CREATE UNIQUE INDEX IF NOT EXISTS ops_deal_stakeholders_deal_org_unique
  ON ops.deal_stakeholders (deal_id, organization_id)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ops_deal_stakeholders_deal_entity_unique
  ON ops.deal_stakeholders (deal_id, entity_id)
  WHERE entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ops_deal_stakeholders_deal_id_idx
  ON ops.deal_stakeholders (deal_id);

CREATE INDEX IF NOT EXISTS ops_deal_stakeholders_organization_id_idx
  ON ops.deal_stakeholders (organization_id)
  WHERE organization_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ops_deal_stakeholders_entity_id_idx
  ON ops.deal_stakeholders (entity_id)
  WHERE entity_id IS NOT NULL;

-- 4. RLS
ALTER TABLE ops.deal_stakeholders ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_stakeholders_select ON ops.deal_stakeholders
  FOR SELECT USING (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

CREATE POLICY deal_stakeholders_insert ON ops.deal_stakeholders
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL
    AND deal_id IN (
      SELECT id FROM public.deals
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

CREATE POLICY deal_stakeholders_update ON ops.deal_stakeholders
  FOR UPDATE USING (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

CREATE POLICY deal_stakeholders_delete ON ops.deal_stakeholders
  FOR DELETE USING (
    deal_id IN (
      SELECT id FROM public.deals
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

-- 5. Drop public.deal_stakeholders (data already copied above)
DROP TABLE public.deal_stakeholders;
