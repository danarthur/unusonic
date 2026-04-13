-- =============================================================================
-- Create ops.kit_templates
--
-- Purpose: Role-based expected equipment lists (e.g., "Mobile DJ Standard Kit")
-- that show crew members what they should own for a role.
--
-- items: JSONB array of { catalog_item_id?: string, name: string,
--        category: string, quantity: number, optional: boolean }
--
-- Follows the same pattern as ops.crew_skills.
-- =============================================================================

CREATE TABLE ops.kit_templates (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL,
  role_tag      text        NOT NULL CHECK (char_length(role_tag) BETWEEN 1 AND 120),
  name          text        NOT NULL CHECK (char_length(name) BETWEEN 1 AND 200),
  items         jsonb       NOT NULL DEFAULT '[]',
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT kit_templates_workspace_role_uniq
    UNIQUE (workspace_id, role_tag)
);

COMMENT ON TABLE ops.kit_templates IS
  'Role-based expected equipment lists. Each template defines items a crew member should own for a given role_tag. items is a JSONB array.';

CREATE INDEX kit_templates_workspace_idx ON ops.kit_templates (workspace_id);
CREATE INDEX kit_templates_role_tag_idx ON ops.kit_templates (role_tag);

ALTER TABLE ops.kit_templates ENABLE ROW LEVEL SECURITY;

CREATE POLICY kit_templates_select ON ops.kit_templates
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY kit_templates_insert ON ops.kit_templates
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY kit_templates_update ON ops.kit_templates
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY kit_templates_delete ON ops.kit_templates
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.kit_templates TO authenticated;

CREATE OR REPLACE FUNCTION ops.set_kit_templates_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER kit_templates_updated_at
  BEFORE UPDATE ON ops.kit_templates
  FOR EACH ROW EXECUTE FUNCTION ops.set_kit_templates_updated_at();
