-- =============================================================================
-- claim_ghost_entity_workspace RPC
--
-- Sets owner_workspace_id on a ghost (unclaimed) directory entity that is
-- missing it. Called after add_ghost_member to ensure the new entity is
-- visible to cortex.relationships RLS policies that filter by source entity
-- workspace.
--
-- Safety: only updates entities where claimed_by_user_id IS NULL and
-- owner_workspace_id IS NULL — never touches claimed accounts.
-- Authorization: caller must be in the target workspace.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.claim_ghost_entity_workspace(
  p_entity_id   uuid,
  p_workspace_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_workspace_id NOT IN (SELECT get_my_workspace_ids()) THEN
    RAISE EXCEPTION 'access denied: workspace not in caller scope';
  END IF;

  UPDATE directory.entities
  SET owner_workspace_id = p_workspace_id
  WHERE id = p_entity_id
    AND claimed_by_user_id IS NULL
    AND owner_workspace_id IS NULL;
END;
$$;

COMMENT ON FUNCTION public.claim_ghost_entity_workspace(uuid, uuid) IS
  'Sets owner_workspace_id on a ghost entity (null claimed_by_user_id, null owner_workspace_id). SECURITY DEFINER — caller must be in the target workspace. Used after add_ghost_member to ensure cortex RLS visibility.';

GRANT EXECUTE ON FUNCTION public.claim_ghost_entity_workspace(uuid, uuid) TO authenticated;
