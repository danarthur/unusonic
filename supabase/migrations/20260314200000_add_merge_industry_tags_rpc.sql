-- =============================================================================
-- SECURITY DEFINER RPC: merge_industry_tags
-- Merges p_from_tag into p_to_tag across the workspace:
--   1. Validates caller is owner/admin.
--   2. Validates both tags exist in ops.workspace_industry_tags for this workspace.
--   3. For every cortex.relationships edge where source entity is in this workspace
--      and p_from_tag is in context_data.industry_tags:
--      adds p_to_tag (if not already present), removes p_from_tag.
--   4. Deletes the dictionary row for p_from_tag.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.merge_industry_tags(
  p_workspace_id uuid,
  p_from_tag     text,
  p_to_tag       text
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

  IF p_from_tag = p_to_tag THEN
    RAISE EXCEPTION 'Source and destination tags must be different';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ops.workspace_industry_tags
    WHERE workspace_id = p_workspace_id AND tag = p_from_tag
  ) THEN
    RAISE EXCEPTION 'Source tag "%" not found in workspace dictionary', p_from_tag;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM ops.workspace_industry_tags
    WHERE workspace_id = p_workspace_id AND tag = p_to_tag
  ) THEN
    RAISE EXCEPTION 'Destination tag "%" not found in workspace dictionary', p_to_tag;
  END IF;

  -- Set caller identity so the cortex audit trigger captures who triggered the merge
  PERFORM set_config('app.current_entity_id', auth.uid()::text, true);
  PERFORM set_config('app.current_entity_name', 'tag-merge', true);

  UPDATE cortex.relationships
  SET context_data = jsonb_set(
    context_data,
    '{industry_tags}',
    (
      CASE
        WHEN (context_data -> 'industry_tags') ? p_to_tag
        THEN context_data -> 'industry_tags'
        ELSE (context_data -> 'industry_tags') || to_jsonb(p_to_tag)
      END
    ) - p_from_tag
  )
  WHERE source_entity_id IN (
    SELECT id FROM directory.entities
    WHERE owner_workspace_id = p_workspace_id
  )
  AND (context_data -> 'industry_tags') ? p_from_tag;

  DELETE FROM ops.workspace_industry_tags
  WHERE workspace_id = p_workspace_id
    AND tag = p_from_tag;
END;
$$;

GRANT EXECUTE ON FUNCTION public.merge_industry_tags(uuid, text, text) TO authenticated;
