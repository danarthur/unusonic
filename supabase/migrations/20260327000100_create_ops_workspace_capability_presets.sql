-- ops.workspace_capability_presets — workspace-configurable capability dictionary
-- Seeded with 4 defaults; workspaces can add/remove as needed.

CREATE TABLE ops.workspace_capability_presets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  capability   text        NOT NULL CHECK (char_length(capability) BETWEEN 1 AND 120),
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_capability_presets_uniq UNIQUE (workspace_id, capability)
);

CREATE INDEX workspace_capability_presets_ws_idx ON ops.workspace_capability_presets (workspace_id);

ALTER TABLE ops.workspace_capability_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_cap_presets_select ON ops.workspace_capability_presets
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY workspace_cap_presets_insert ON ops.workspace_capability_presets
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids())
    AND user_has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY workspace_cap_presets_update ON ops.workspace_capability_presets
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids())
    AND user_has_workspace_role(workspace_id, ARRAY['owner', 'admin']));
CREATE POLICY workspace_cap_presets_delete ON ops.workspace_capability_presets
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids())
    AND user_has_workspace_role(workspace_id, ARRAY['owner', 'admin']));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.workspace_capability_presets TO authenticated;

-- Seed defaults for all existing workspaces
INSERT INTO ops.workspace_capability_presets (workspace_id, capability, sort_order)
SELECT w.id, cap.capability, cap.sort_order
FROM public.workspaces w
CROSS JOIN (VALUES
  ('Sales',                 0),
  ('Account Management',    1),
  ('Finance',               2),
  ('Production Management', 3)
) AS cap(capability, sort_order)
ON CONFLICT (workspace_id, capability) DO NOTHING;
