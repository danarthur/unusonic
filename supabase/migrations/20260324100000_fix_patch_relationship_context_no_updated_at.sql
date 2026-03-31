-- Fix: remove `updated_at = now()` from patch_relationship_context.
--
-- cortex.relationships has no updated_at column — the audit trail is stored
-- in context_data by the cortex_relationships_audit_trail trigger.
-- The spurious SET updated_at = now() causes a runtime error on every call.

CREATE OR REPLACE FUNCTION public.patch_relationship_context(
  p_source_entity_id  uuid,
  p_target_entity_id  uuid,
  p_relationship_type text,
  p_patch             jsonb
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_owner_workspace_id uuid;
  v_caller_entity_id   uuid;
  v_caller_name        text;
  v_updated            int;
BEGIN
  -- 1. Resolve workspace that owns the source entity
  SELECT owner_workspace_id INTO v_owner_workspace_id
  FROM directory.entities
  WHERE id = p_source_entity_id;

  IF v_owner_workspace_id IS NULL THEN
    RAISE EXCEPTION 'access denied: source entity not found';
  END IF;

  -- 2. Authorization: workspace IAM only.
  IF NOT public.user_has_workspace_role(v_owner_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'access denied: requires owner or admin role in workspace';
  END IF;

  -- 3. Resolve caller entity for audit trail.
  SELECT id, display_name INTO v_caller_entity_id, v_caller_name
  FROM directory.entities
  WHERE claimed_by_user_id = auth.uid()
  LIMIT 1;

  -- 4. Expose caller identity to the audit trigger via session-local set_config.
  IF v_caller_entity_id IS NOT NULL THEN
    PERFORM set_config('app.current_entity_id',   v_caller_entity_id::text, true);
    PERFORM set_config('app.current_entity_name', COALESCE(v_caller_name, ''),  true);
  END IF;

  -- 5. Merge patch into existing context_data.
  --    Audit trail (last_modified_at/by) is written by the BEFORE UPDATE trigger.
  UPDATE cortex.relationships
  SET context_data = COALESCE(context_data, '{}'::jsonb) || p_patch
  WHERE source_entity_id  = p_source_entity_id
    AND target_entity_id  = p_target_entity_id
    AND relationship_type = p_relationship_type;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

COMMENT ON FUNCTION public.patch_relationship_context(uuid, uuid, text, jsonb) IS
  'Merges a JSONB patch into a cortex relationship edge context_data. SECURITY DEFINER — caller must hold owner or admin in the source entity workspace. Sets app.current_entity_id + app.current_entity_name for the audit trigger. Unmentioned keys are preserved. Returns true if an edge was found and updated.';

GRANT EXECUTE ON FUNCTION public.patch_relationship_context(uuid, uuid, text, jsonb) TO authenticated;
