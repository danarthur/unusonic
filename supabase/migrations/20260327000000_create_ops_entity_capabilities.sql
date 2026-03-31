-- ops.entity_capabilities — business function tags for directory entities.
-- Answers "what does this person do in the business?" (sales, finance, etc.)
-- Separate from ops.crew_skills which answers "what can they do on a show?"

CREATE TABLE ops.entity_capabilities (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    uuid        NOT NULL,
  workspace_id uuid        NOT NULL,
  capability   text        NOT NULL CHECK (char_length(capability) BETWEEN 1 AND 120),
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT entity_capabilities_uniq UNIQUE (entity_id, workspace_id, capability)
);

CREATE INDEX entity_capabilities_entity_ws_idx ON ops.entity_capabilities (entity_id, workspace_id);
CREATE INDEX entity_capabilities_capability_idx ON ops.entity_capabilities (capability);
CREATE INDEX entity_capabilities_ws_cap_idx ON ops.entity_capabilities (workspace_id, capability);

ALTER TABLE ops.entity_capabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_capabilities_select ON ops.entity_capabilities
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY entity_capabilities_insert ON ops.entity_capabilities
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY entity_capabilities_update ON ops.entity_capabilities
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY entity_capabilities_delete ON ops.entity_capabilities
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.entity_capabilities TO authenticated;
