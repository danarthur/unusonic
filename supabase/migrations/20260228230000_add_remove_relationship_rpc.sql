-- =============================================================================
-- remove_relationship RPC (cortex write via public, same as upsert_relationship)
--
-- Security: user_has_workspace_role(owner_workspace_id, ['owner', 'admin']) on
-- the source entity's workspace — no relationship-based auth (no escalation via
-- context_data->>'app_role'). Call from client: supabase.rpc('remove_relationship', {...})
-- =============================================================================

CREATE OR REPLACE FUNCTION public.remove_relationship(
  p_source_entity_id   uuid,
  p_target_entity_id  uuid,
  p_relationship_type text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_workspace_id uuid;
  v_deleted            int;
BEGIN
  -- Resolve workspace that owns the source entity (same as upsert_relationship)
  SELECT owner_workspace_id INTO v_owner_workspace_id
  FROM directory.entities
  WHERE id = p_source_entity_id;

  IF v_owner_workspace_id IS NULL THEN
    RAISE EXCEPTION 'access denied: source entity not found';
  END IF;

  -- Only workspace owners and admins can remove relationships (no app_role on edge)
  IF NOT public.user_has_workspace_role(v_owner_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'access denied: requires owner or admin role in workspace';
  END IF;

  DELETE FROM cortex.relationships
  WHERE source_entity_id   = p_source_entity_id
    AND target_entity_id   = p_target_entity_id
    AND relationship_type = p_relationship_type;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted > 0;
END;
$$;

COMMENT ON FUNCTION public.remove_relationship(uuid, uuid, text) IS
  'Removes one cortex relationship edge. SECURITY DEFINER — caller must have owner or admin in the source entity''s workspace (user_has_workspace_role). Use for ROSTER_MEMBER, etc.';

GRANT EXECUTE ON FUNCTION public.remove_relationship(uuid, uuid, text) TO authenticated;
