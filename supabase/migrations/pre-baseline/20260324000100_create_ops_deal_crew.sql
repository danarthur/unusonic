-- Migration: create_ops_deal_crew
-- Creates ops.deal_crew for the deal production team.
-- confirmed_at IS NULL = suggestion surfaced from proposal; set = confirmed crew member.
-- source = 'manual' | 'proposal'
-- catalog_item_id = which package surfaced this suggestion (nullable).

CREATE TABLE ops.deal_crew (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id          uuid        NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  workspace_id     uuid        NOT NULL,
  entity_id        uuid,                 -- soft ref to directory.entities (ghost protocol — no FK); null for role-only slots
  role_note        text,
  source           text        NOT NULL CHECK (source IN ('manual', 'proposal')),
  catalog_item_id  uuid,                 -- soft ref to public.packages (nullable)
  confirmed_at     timestamptz,          -- null = suggestion; set = confirmed
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX deal_crew_deal_id_idx       ON ops.deal_crew (deal_id);
CREATE INDEX deal_crew_workspace_id_idx  ON ops.deal_crew (workspace_id);
CREATE INDEX deal_crew_entity_id_idx     ON ops.deal_crew (entity_id);
CREATE INDEX deal_crew_catalog_item_idx  ON ops.deal_crew (catalog_item_id);

-- Prevent duplicate entity on same deal
CREATE UNIQUE INDEX deal_crew_deal_entity_uniq ON ops.deal_crew (deal_id, entity_id);

ALTER TABLE ops.deal_crew ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_crew_select ON ops.deal_crew
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY deal_crew_insert ON ops.deal_crew
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY deal_crew_update ON ops.deal_crew
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY deal_crew_delete ON ops.deal_crew
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.deal_crew TO authenticated;
