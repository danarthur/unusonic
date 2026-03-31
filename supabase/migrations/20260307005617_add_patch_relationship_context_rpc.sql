-- =============================================================================
-- patch_relationship_context RPC
--
-- Surgically merges a JSONB patch into an existing cortex.relationships
-- context_data field. Use this to update individual keys (e.g. job_title,
-- skill_tags, app_role on a ROSTER_MEMBER edge) without clobbering other keys.
--
-- Contrast with upsert_relationship, which replaces context_data wholesale
-- on conflict.
--
-- Security: SECURITY DEFINER — same gate as remove_relationship:
--   caller must hold owner or admin in the source entity's workspace
--   (user_has_workspace_role). Authorization delegates to workspace IAM
--   (workspace_members + ops.workspace_roles), never to context_data values.
--
-- Schema: public — consistent with upsert_relationship and remove_relationship.
-- SET search_path = public — prevents schema-injection attacks.
--
-- Call from client: supabase.rpc('patch_relationship_context', {
--   p_source_entity_id, p_target_entity_id, p_relationship_type, p_patch
-- })
-- Returns: true if a row was updated, false if the edge doesn't exist.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.patch_relationship_context(
  p_source_entity_id  uuid,
  p_target_entity_id  uuid,
  p_relationship_type text,
  p_patch             jsonb   -- merged (||) into existing context_data; null keys in patch remove keys
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_workspace_id uuid;
  v_updated            int;
BEGIN
  -- 1. Resolve workspace that owns the source entity
  SELECT owner_workspace_id INTO v_owner_workspace_id
  FROM directory.entities
  WHERE id = p_source_entity_id;

  IF v_owner_workspace_id IS NULL THEN
    RAISE EXCEPTION 'access denied: source entity not found';
  END IF;

  -- 2. Authorization: workspace IAM only — same gate as remove_relationship.
  --    Never reads context_data to determine permission (avoids circular trust).
  IF NOT public.user_has_workspace_role(v_owner_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'access denied: requires owner or admin role in workspace';
  END IF;

  -- 3. Merge patch into existing context_data.
  --    || operator: right-hand keys overwrite left-hand keys; unmentioned keys survive.
  --    COALESCE guards against a NULL context_data column.
  UPDATE cortex.relationships
  SET
    context_data = COALESCE(context_data, '{}'::jsonb) || p_patch,
    updated_at   = now()
  WHERE source_entity_id  = p_source_entity_id
    AND target_entity_id  = p_target_entity_id
    AND relationship_type = p_relationship_type;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.patch_relationship_context(uuid, uuid, text, jsonb) IS
  'Merges a JSONB patch into a cortex relationship edge context_data. SECURITY DEFINER — caller must hold owner or admin in the source entity workspace (user_has_workspace_role). Unmentioned keys are preserved. Returns true if an edge was found and updated.';

GRANT EXECUTE ON FUNCTION public.patch_relationship_context(uuid, uuid, text, jsonb) TO authenticated;
