-- =============================================================================
-- Audit trail for cortex.relationships context_data
--
-- Adds `last_modified_by`, `last_modified_by_name`, and `last_modified_at`
-- to context_data automatically on every meaningful UPDATE.
--
-- Two-part change:
--   1. patch_relationship_context: sets app.current_entity_id and
--      app.current_entity_name via set_config before the UPDATE so the trigger
--      can read the caller's identity.
--   2. Trigger cortex_relationships_audit_trail: BEFORE UPDATE on
--      cortex.relationships — writes audit keys to context_data only when
--      context_data actually changed (DISTINCT guard).
--
-- CRITICAL: The DISTINCT guard is not optional. Without it, every no-op
-- upsert (backfill RPCs, heartbeat updates) overwrites last_modified_at with
-- noise timestamps. All audit data is corrupted within hours and cannot be
-- recovered.
-- =============================================================================

-- ─── 1. Trigger function (must exist before the trigger references it) ────────

CREATE OR REPLACE FUNCTION public.cortex_relationships_audit_trail()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entity_id   text;
  v_entity_name text;
BEGIN
  -- DISTINCT guard: only fire when context_data actually changed.
  -- This prevents backfill RPCs and no-op upserts from corrupting audit data.
  IF (OLD.context_data IS NOT DISTINCT FROM NEW.context_data) THEN
    RETURN NEW;
  END IF;

  v_entity_id   := current_setting('app.current_entity_id',   true);
  v_entity_name := current_setting('app.current_entity_name', true);

  -- Only write audit keys when the caller identity is known.
  -- If set_config was not called (e.g. direct SQL in migrations), skip silently
  -- rather than writing empty/null audit data.
  IF v_entity_id IS NOT NULL AND v_entity_id <> '' THEN
    NEW.context_data := NEW.context_data ||
      jsonb_build_object(
        'last_modified_at',   now()::text,
        'last_modified_by',   v_entity_id,
        'last_modified_by_name', COALESCE(v_entity_name, '')
      );
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.cortex_relationships_audit_trail() IS
  'BEFORE UPDATE trigger function: writes last_modified_by/at to context_data when context_data changes. Reads caller identity from app.current_entity_id / app.current_entity_name set_config vars. Requires DISTINCT guard to prevent backfill corruption.';

-- ─── 2. Attach trigger to cortex.relationships ────────────────────────────────

DROP TRIGGER IF EXISTS trg_cortex_relationships_audit ON cortex.relationships;

CREATE TRIGGER trg_cortex_relationships_audit
  BEFORE UPDATE ON cortex.relationships
  FOR EACH ROW
  EXECUTE FUNCTION public.cortex_relationships_audit_trail();

-- ─── 3. Replace patch_relationship_context to set caller identity before write ─

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

  -- 2. Authorization: workspace IAM only — same gate as remove_relationship.
  --    Never reads context_data to determine permission (avoids circular trust).
  IF NOT public.user_has_workspace_role(v_owner_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'access denied: requires owner or admin role in workspace';
  END IF;

  -- 3. Resolve caller entity for audit trail.
  --    Uses claimed_by_user_id on directory.entities to find the caller's node.
  --    Safe to proceed if not found — audit keys will be skipped by the trigger.
  SELECT id, display_name INTO v_caller_entity_id, v_caller_name
  FROM directory.entities
  WHERE claimed_by_user_id = auth.uid()
  LIMIT 1;

  -- 4. Expose caller identity to the audit trigger via session-local set_config.
  --    is_local = true: scoped to this transaction only, not the whole session.
  IF v_caller_entity_id IS NOT NULL THEN
    PERFORM set_config('app.current_entity_id',   v_caller_entity_id::text, true);
    PERFORM set_config('app.current_entity_name', COALESCE(v_caller_name, ''),  true);
  END IF;

  -- 5. Merge patch into existing context_data.
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
  'Merges a JSONB patch into a cortex relationship edge context_data. SECURITY DEFINER — caller must hold owner or admin in the source entity workspace (user_has_workspace_role). Sets app.current_entity_id + app.current_entity_name for the audit trigger. Unmentioned keys are preserved. Returns true if an edge was found and updated.';

GRANT EXECUTE ON FUNCTION public.patch_relationship_context(uuid, uuid, text, jsonb) TO authenticated;
