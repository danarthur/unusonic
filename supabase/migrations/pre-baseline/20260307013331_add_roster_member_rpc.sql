-- =============================================================================
-- add_roster_member RPC
--
-- Creates or updates a ROSTER_MEMBER edge (person → org). Use when adding
-- talent to an org roster; the person entity may not belong to the caller's
-- workspace (e.g. ghost or user from another org).
--
-- Authorization: caller must have owner or admin in the TARGET (org) entity's
-- workspace. Contrast with upsert_relationship, which requires the SOURCE
-- entity to be in the caller's workspace.
--
-- Returns: cortex.relationships.id (uuid).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.add_roster_member(
  p_person_entity_id uuid,
  p_org_entity_id    uuid,
  p_context_data     jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org_workspace_id uuid;
  v_id               uuid;
BEGIN
  -- 1. Resolve target (org) entity's workspace
  SELECT owner_workspace_id INTO v_org_workspace_id
  FROM directory.entities
  WHERE id = p_org_entity_id;

  IF v_org_workspace_id IS NULL THEN
    RAISE EXCEPTION 'access denied: org entity not found';
  END IF;

  -- 2. Caller must have access to that workspace and be owner or admin
  IF v_org_workspace_id NOT IN (SELECT get_my_workspace_ids()) THEN
    RAISE EXCEPTION 'access denied: org not in caller workspace';
  END IF;
  IF NOT public.user_has_workspace_role(v_org_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'access denied: requires owner or admin role in org workspace';
  END IF;

  -- 3. Insert or update ROSTER_MEMBER edge
  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_person_entity_id, p_org_entity_id, 'ROSTER_MEMBER', COALESCE(p_context_data, '{}'::jsonb))
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.add_roster_member(uuid, uuid, jsonb) IS
  'Creates or updates a ROSTER_MEMBER edge. SECURITY DEFINER — caller must hold owner or admin in the target (org) workspace. Use when adding a person to an org roster (source person may be ghost or from another workspace).';

GRANT EXECUTE ON FUNCTION public.add_roster_member(uuid, uuid, jsonb) TO authenticated;
