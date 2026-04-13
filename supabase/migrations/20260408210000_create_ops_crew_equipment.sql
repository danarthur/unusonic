-- =============================================================================
-- Create ops.crew_equipment
--
-- Purpose: Structured equipment profiles per person entity per workspace.
-- Mirrors ops.crew_skills pattern — entity-linked, workspace-scoped,
-- Ghost Protocol compatible.
--
-- entity_id is a soft reference to directory.entities.
-- catalog_item_id is an optional FK to public.packages for gap analysis.
-- =============================================================================

CREATE TABLE ops.crew_equipment (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       uuid        NOT NULL,
  workspace_id    uuid        NOT NULL,
  category        text        NOT NULL CHECK (category IN (
                    'audio', 'lighting', 'video', 'staging', 'power', 'misc'
                  )),
  name            text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  quantity        integer     NOT NULL DEFAULT 1 CHECK (quantity > 0),
  notes           text,
  catalog_item_id uuid        REFERENCES public.packages(id) ON DELETE SET NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT crew_equipment_entity_workspace_name_uniq
    UNIQUE (entity_id, workspace_id, name)
);

COMMENT ON TABLE ops.crew_equipment IS
  'Structured equipment profiles per person entity per workspace. entity_id is a soft reference to directory.entities — Ghost Protocol compatible. Phase 2 of crew equipment tracking.';

CREATE INDEX crew_equipment_entity_workspace_idx ON ops.crew_equipment (entity_id, workspace_id);
CREATE INDEX crew_equipment_workspace_idx ON ops.crew_equipment (workspace_id);
CREATE INDEX crew_equipment_category_idx ON ops.crew_equipment (category);

ALTER TABLE ops.crew_equipment ENABLE ROW LEVEL SECURITY;

CREATE POLICY crew_equipment_select ON ops.crew_equipment
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY crew_equipment_insert ON ops.crew_equipment
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY crew_equipment_update ON ops.crew_equipment
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY crew_equipment_delete ON ops.crew_equipment
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.crew_equipment TO authenticated;

CREATE OR REPLACE FUNCTION ops.set_crew_equipment_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER crew_equipment_updated_at
  BEFORE UPDATE ON ops.crew_equipment
  FOR EACH ROW EXECUTE FUNCTION ops.set_crew_equipment_updated_at();
