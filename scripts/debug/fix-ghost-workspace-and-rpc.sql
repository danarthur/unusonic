-- =============================================================================
-- RUN THIS IN SUPABASE SQL EDITOR
-- Part 1: Patch existing ghost entities with null owner_workspace_id
-- Part 2: Create claim_ghost_entity_workspace RPC for future adds
-- =============================================================================

-- PART 1: Patch existing ghosts
-- Assigns owner_workspace_id from the org they're rostered to.
-- Safe: only touches ghost entities (null claimed_by_user_id) with null workspace
-- that have a ROSTER_MEMBER edge pointing to an org with a known workspace.

UPDATE directory.entities e
SET owner_workspace_id = org.owner_workspace_id
FROM cortex.relationships r
JOIN directory.entities org ON org.id = r.target_entity_id
WHERE r.source_entity_id = e.id
  AND r.relationship_type = 'ROSTER_MEMBER'
  AND e.claimed_by_user_id IS NULL
  AND e.owner_workspace_id IS NULL
  AND org.owner_workspace_id IS NOT NULL;

-- =============================================================================

-- PART 2: Create the RPC so future invites patch the workspace correctly.

CREATE OR REPLACE FUNCTION public.claim_ghost_entity_workspace(
  p_entity_id    uuid,
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
  'Sets owner_workspace_id on a ghost entity (null claimed_by_user_id, null owner_workspace_id). SECURITY DEFINER — caller must be in the target workspace.';

GRANT EXECUTE ON FUNCTION public.claim_ghost_entity_workspace(uuid, uuid) TO authenticated;
