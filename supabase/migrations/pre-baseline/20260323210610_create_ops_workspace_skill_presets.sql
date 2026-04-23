-- =============================================================================
-- Create ops.workspace_skill_presets
--
-- Purpose: Workspace-scoped skill tag presets. Owner/admin can configure which
-- skill tags appear as quick-picks when assigning skills to roster members.
-- Members can still add free-text skills; presets are just the curated list.
--
-- RLS:
--   SELECT — any workspace member via get_my_workspace_ids()
--   INSERT/UPDATE/DELETE — owner or admin only via user_has_workspace_role()
--
-- Seeded with the 10 hardcoded defaults that previously lived in the UI for
-- all existing workspaces. New workspaces start with an empty preset list and
-- can configure their own.
-- =============================================================================

CREATE TABLE ops.workspace_skill_presets (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  skill_tag    text        NOT NULL CHECK (char_length(skill_tag) BETWEEN 1 AND 120),
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_skill_presets_unique UNIQUE (workspace_id, skill_tag)
);

COMMENT ON TABLE ops.workspace_skill_presets IS
  'Curated skill tag quick-picks per workspace. Owner/admin can add or remove entries. Members see these as suggestions when tagging roster skills.';

CREATE INDEX ops_workspace_skill_presets_workspace_id_idx
  ON ops.workspace_skill_presets (workspace_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE ops.workspace_skill_presets ENABLE ROW LEVEL SECURITY;

CREATE POLICY skill_presets_select ON ops.workspace_skill_presets
  FOR SELECT USING (
    workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY skill_presets_insert ON ops.workspace_skill_presets
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY skill_presets_update ON ops.workspace_skill_presets
  FOR UPDATE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY skill_presets_delete ON ops.workspace_skill_presets
  FOR DELETE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.workspace_skill_presets TO authenticated;

-- =============================================================================
-- Seed defaults for all existing workspaces
-- These match the hardcoded PRESET_SKILL_TAGS list that was in the UI.
-- ON CONFLICT DO NOTHING so re-running is safe.
-- =============================================================================

INSERT INTO ops.workspace_skill_presets (workspace_id, skill_tag, sort_order)
SELECT w.id, tag.skill_tag, tag.sort_order
FROM public.workspaces w
CROSS JOIN (VALUES
  ('Audio A1',      0),
  ('Audio A2',      1),
  ('DJ',            2),
  ('Lighting',      3),
  ('Video',         4),
  ('Camera Op',     5),
  ('Stage Manager', 6),
  ('Rigging',       7),
  ('GrandMA3',      8),
  ('Backline',      9)
) AS tag(skill_tag, sort_order)
ON CONFLICT (workspace_id, skill_tag) DO NOTHING;
