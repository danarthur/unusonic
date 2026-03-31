-- =============================================================================
-- Create ops.workspace_industry_tags
--
-- Purpose: Workspace-scoped managed taxonomy for Network partner/vendor/venue
-- sub-categorization. Tags are stored as industry_tags[] in
-- cortex.relationships.context_data.
--
-- Design: two-column (tag = snake_case key, label = display name) so the stored
-- key on relationship edges is stable even if the human label is later renamed.
--
-- RLS:
--   SELECT — any workspace member via get_my_workspace_ids()
--   INSERT/UPDATE/DELETE — owner or admin only via user_has_workspace_role()
--
-- Also creates strip_industry_tag(workspace_id, tag) SECURITY DEFINER RPC for
-- cascade-delete: strips a tag from all affected relationship edges, then removes
-- the dictionary row in one atomic operation.
-- =============================================================================

CREATE TABLE ops.workspace_industry_tags (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  tag          text        NOT NULL CHECK (char_length(tag) BETWEEN 1 AND 80),
  label        text        NOT NULL CHECK (char_length(label) BETWEEN 1 AND 80),
  sort_order   int         NOT NULL DEFAULT 0,
  created_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT workspace_industry_tags_unique UNIQUE (workspace_id, tag)
);

COMMENT ON TABLE ops.workspace_industry_tags IS
  'Managed taxonomy for Network partner/vendor/venue sub-categories. Owner/admin controls the dictionary; all members use it via the IndustryTagPicker.';

CREATE INDEX ops_workspace_industry_tags_workspace_id_idx
  ON ops.workspace_industry_tags (workspace_id);

-- =============================================================================
-- RLS
-- =============================================================================

ALTER TABLE ops.workspace_industry_tags ENABLE ROW LEVEL SECURITY;

CREATE POLICY industry_tags_select ON ops.workspace_industry_tags
  FOR SELECT USING (
    workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY industry_tags_insert ON ops.workspace_industry_tags
  FOR INSERT WITH CHECK (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY industry_tags_update ON ops.workspace_industry_tags
  FOR UPDATE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY industry_tags_delete ON ops.workspace_industry_tags
  FOR DELETE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.workspace_industry_tags TO authenticated;

-- =============================================================================
-- Seed Phase 1 defaults for all existing workspaces
-- ON CONFLICT DO NOTHING — safe to re-run.
-- =============================================================================

INSERT INTO ops.workspace_industry_tags (workspace_id, tag, label, sort_order)
SELECT w.id, t.tag, t.label, t.sort_order
FROM public.workspaces w
CROSS JOIN (VALUES
  ('dj',               'DJ',                  0),
  ('live_musician',    'Live Musician',        1),
  ('videographer',     'Videographer',         2),
  ('photographer',     'Photographer',         3),
  ('coordinator',      'Coordinator',          4),
  ('planner',          'Planner / Producer',   5),
  ('photo_booth',      'Photo Booth',          6),
  ('lighting',         'Lighting',             7),
  ('decor',            'Decor & Florals',      8),
  ('caterer',          'Catering',             9),
  ('venue',            'Venue',               10),
  ('av_company',       'A/V Company',         11),
  ('transportation',   'Transportation',      12),
  ('security',         'Security',            13)
) AS t(tag, label, sort_order)
ON CONFLICT (workspace_id, tag) DO NOTHING;

-- =============================================================================
-- SECURITY DEFINER RPC: strip_industry_tag
--
-- Called when an admin deletes a dictionary tag that is currently in use.
-- Atomically:
--   1. Validates the caller is owner/admin for the workspace.
--   2. Removes the tag from context_data.industry_tags[] on all affected
--      cortex.relationships edges whose source entity belongs to this workspace.
--   3. Deletes the dictionary row.
--
-- The client-layer server action handles the count-check + confirmation dialog
-- before calling this. The RPC itself does not refuse if count = 0.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.strip_industry_tag(
  p_workspace_id uuid,
  p_tag          text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Insufficient permissions — owner or admin required';
  END IF;

  -- Strip tag from all affected relationship edges in this workspace
  UPDATE cortex.relationships
  SET context_data = jsonb_set(
    context_data,
    '{industry_tags}',
    (context_data -> 'industry_tags') - p_tag
  )
  WHERE source_entity_id IN (
    SELECT id FROM directory.entities
    WHERE owner_workspace_id = p_workspace_id
  )
  AND (context_data -> 'industry_tags') ? p_tag;

  -- Delete the dictionary row
  DELETE FROM ops.workspace_industry_tags
  WHERE workspace_id = p_workspace_id
    AND tag = p_tag;
END;
$$;

GRANT EXECUTE ON FUNCTION public.strip_industry_tag(uuid, text) TO authenticated;
