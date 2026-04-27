-- Move 3 of 3 (cortex scope-creep cleanup, Wk 16) — reset_member_passkey → public.
--
-- reset_member_passkey is owner-mediated crew recovery. It runs at the pre-auth
-- boundary alongside public.passkeys, public.guardians, public.recovery_shards.
-- That makes public.* the natural home per CLAUDE.md's pre-auth exception rule.
--
-- The function still writes to cortex.relationships (audit edge) and reads
-- directory.entities (caller/target lookup) — those references stay
-- explicitly schema-qualified in the body, so the move is non-disruptive.

CREATE OR REPLACE FUNCTION public.reset_member_passkey(
  p_workspace_id uuid,
  p_member_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public', 'cortex', 'directory'
AS $$
DECLARE
  v_caller_user_id     uuid;
  v_caller_entity_id   uuid;
  v_target_entity_id   uuid;
  v_target_email       text;
  v_deleted            int;
BEGIN
  v_caller_user_id := auth.uid();
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  IF NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = p_member_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  IF p_member_user_id = v_caller_user_id THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  DELETE FROM public.passkeys
   WHERE user_id = p_member_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  SELECT id INTO v_caller_entity_id
    FROM directory.entities
   WHERE claimed_by_user_id = v_caller_user_id
   LIMIT 1;

  SELECT id INTO v_target_entity_id
    FROM directory.entities
   WHERE claimed_by_user_id = p_member_user_id
   LIMIT 1;

  SELECT email INTO v_target_email
    FROM auth.users
   WHERE id = p_member_user_id;

  IF v_caller_entity_id IS NOT NULL AND v_target_entity_id IS NOT NULL THEN
    INSERT INTO cortex.relationships (
      source_entity_id,
      target_entity_id,
      relationship_type,
      context_data,
      created_at
    )
    VALUES (
      v_caller_entity_id,
      v_target_entity_id,
      'ADMIN_ACTION',
      jsonb_build_object(
        'action',           'reset_member_passkey',
        'actor_user_id',    v_caller_user_id,
        'target_user_id',   p_member_user_id,
        'workspace_id',     p_workspace_id,
        'passkeys_deleted', v_deleted,
        'at',               now(),
        'history',          jsonb_build_array(
          jsonb_build_object(
            'action',           'reset_member_passkey',
            'workspace_id',     p_workspace_id,
            'passkeys_deleted', v_deleted,
            'at',               now()
          )
        )
      ),
      now()
    )
    ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
    DO UPDATE SET
      context_data = jsonb_build_object(
        'action',           'reset_member_passkey',
        'actor_user_id',    v_caller_user_id,
        'target_user_id',   p_member_user_id,
        'workspace_id',     p_workspace_id,
        'passkeys_deleted', v_deleted,
        'at',               now(),
        'history',
          COALESCE(cortex.relationships.context_data -> 'history', '[]'::jsonb)
          || jsonb_build_array(
            jsonb_build_object(
              'action',           'reset_member_passkey',
              'workspace_id',     p_workspace_id,
              'passkeys_deleted', v_deleted,
              'at',               now()
            )
          )
      );
  END IF;

  RETURN jsonb_build_object(
    'target_user_id',   p_member_user_id,
    'target_email',     v_target_email,
    'passkeys_deleted', v_deleted
  );
END;
$$;

DROP FUNCTION cortex.reset_member_passkey(uuid, uuid);

REVOKE EXECUTE ON FUNCTION public.reset_member_passkey(uuid, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.reset_member_passkey(uuid, uuid) FROM anon;
GRANT  EXECUTE ON FUNCTION public.reset_member_passkey(uuid, uuid) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.reset_member_passkey(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security regression: anon has EXECUTE on public.reset_member_passkey';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.reset_member_passkey(uuid, uuid)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Grant regression: authenticated lost EXECUTE on public.reset_member_passkey';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace WHERE n.nspname = 'cortex' AND p.proname = 'reset_member_passkey') THEN
    RAISE EXCEPTION 'Move failed: cortex.reset_member_passkey still exists';
  END IF;
END $$;
