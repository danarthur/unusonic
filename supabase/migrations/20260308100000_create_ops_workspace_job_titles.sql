-- =============================================================================
-- Create ops.workspace_job_titles
--
-- Purpose: Workspace-scoped standardized job title list. Owner/admin curates
-- which titles exist (e.g. "DJ", "Lighting Director", "Stage Manager").
-- Members are assigned one of these titles, enabling reliable crew filtering
-- in AssignCrewSheet — "show me all DJs" works because "DJ" is a controlled
-- value, not freeform text.
--
-- Relationship to skills:
--   Job title = what someone IS (their role/position in the org)
--   Skills    = what someone CAN DO (specific technical competencies)
--
-- RLS: same pattern as ops.workspace_skill_presets.
-- =============================================================================

CREATE TABLE ops.workspace_job_titles (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  title        text        NOT NULL CHECK (char_length(title) BETWEEN 1 AND 120),
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_job_titles_unique UNIQUE (workspace_id, title)
);

COMMENT ON TABLE ops.workspace_job_titles IS
  'Curated job title options per workspace. Owner/admin manages the list. Members select one of these titles so crew assignment filtering is exact rather than fuzzy freeform text matching.';

CREATE INDEX ops_workspace_job_titles_workspace_id_idx
  ON ops.workspace_job_titles (workspace_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE ops.workspace_job_titles ENABLE ROW LEVEL SECURITY;

CREATE POLICY job_titles_select ON ops.workspace_job_titles
  FOR SELECT USING (
    workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY job_titles_insert ON ops.workspace_job_titles
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY job_titles_update ON ops.workspace_job_titles
  FOR UPDATE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY job_titles_delete ON ops.workspace_job_titles
  FOR DELETE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.workspace_job_titles TO authenticated;

-- =============================================================================
-- Seed defaults for all existing workspaces
-- Common event production roles — admins can add/remove after.
-- =============================================================================

INSERT INTO ops.workspace_job_titles (workspace_id, title, sort_order)
SELECT w.id, jt.title, jt.sort_order
FROM public.workspaces w
CROSS JOIN (VALUES
  ('DJ',                  0),
  ('Audio A1',            1),
  ('Audio A2',            2),
  ('Lighting Director',   3),
  ('Lighting Tech',       4),
  ('Video Director',      5),
  ('Camera Operator',     6),
  ('Stage Manager',       7),
  ('Rigger',              8),
  ('Backline Tech',       9),
  ('Production Manager',  10),
  ('Tour Manager',        11)
) AS jt(title, sort_order)
ON CONFLICT (workspace_id, title) DO NOTHING;
