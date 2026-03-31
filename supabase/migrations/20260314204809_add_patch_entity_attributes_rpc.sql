-- =============================================================================
-- SECURITY DEFINER RPC: patch_entity_attributes
-- Safe JSONB merge for directory.entities.attributes.
-- Uses || operator (no read-modify-write race).
-- Caller must be a workspace member of the entity's owner workspace.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.patch_entity_attributes(
  p_entity_id   uuid,
  p_attributes  jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  -- SECURITY: No inline ownership check. Relies on caller using the session client (RLS-enforced).
  -- Never call this function via the service role client (system.ts) without an explicit
  -- owner_workspace_id guard — doing so would allow cross-workspace attribute writes.

  SELECT owner_workspace_id INTO v_workspace_id
  FROM directory.entities
  WHERE id = p_entity_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Entity not found: %', p_entity_id;
  END IF;

  IF NOT public.user_has_workspace_role(v_workspace_id, ARRAY['owner', 'admin', 'member']) THEN
    RAISE EXCEPTION 'Insufficient permissions';
  END IF;

  -- Strip Ghost Protocol sentinel keys — these must never be overwritten via this RPC.
  -- Ghost state is controlled only by the claim flow (claim_ghost_workspace RPC).
  p_attributes := p_attributes
    - 'is_ghost'
    - 'is_claimed'
    - 'claimed_by_user_id'
    - 'created_by_org_id';

  IF p_attributes = '{}'::jsonb THEN
    RETURN;
  END IF;

  UPDATE directory.entities
  SET attributes = COALESCE(attributes, '{}'::jsonb) || p_attributes
  WHERE id = p_entity_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.patch_entity_attributes(uuid, jsonb) TO authenticated;
