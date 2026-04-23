-- =============================================================================
-- cortex.reset_member_passkey — owner-mediated crew recovery (Login Redesign, Phase 1)
--
-- Design spec: docs/reference/login-redesign-design.md §9.
-- Implementation plan: docs/reference/login-redesign-implementation-plan.md, Phase 1.
--
-- An owner or admin of a workspace can wipe a fellow member's passkey
-- registrations so the member can re-enroll via a magic link emailed by the
-- server action that wraps this RPC. This is the primary recovery path for
-- crew / employees; sovereign recovery (BIP39 + Shamir) is owner-only.
--
-- Authorization rules enforced below:
--   1. Caller must hold 'owner' or 'admin' in p_workspace_id.
--   2. Target user must be a member of p_workspace_id.
--   3. Caller cannot reset themselves (anti-lockout guard).
--
-- Side effects:
--   - DELETE FROM public.passkeys WHERE user_id = p_member_user_id.
--   - INSERT INTO cortex.relationships with relationship_type = 'ADMIN_ACTION'
--     for audit. context_data carries {action, actor_user_id, target_user_id,
--     workspace_id, passkeys_deleted}. Workspace is implicit via
--     source_entity_id → directory.entities.owner_workspace_id (the RLS path).
--   - Does NOT revoke workspace membership, role, or entity associations.
--   - Does NOT send email — the wrapping server action is responsible for
--     generating a magic link and emailing the member.
--
-- Returns a jsonb payload with target_user_id, target_email (pulled from
-- auth.users), and passkeys_deleted so the server action can email the member
-- without a separate lookup.
--
-- Security discipline (per memory note feedback_postgres_function_grants.md):
--   - REVOKE FROM PUBLIC, anon in the same migration. Without this, anon can
--     call a SECURITY DEFINER RPC that DELETEs passkeys — catastrophic.
--   - SECURITY DEFINER + SET search_path = public, cortex, directory (+ auth
--     for the email lookup) prevents search_path injection.
--   - RAISE EXCEPTION with ERRCODE = '42501' (insufficient_privilege) on all
--     authorization failures. Server action should translate into a neutral
--     "Not authorized" error to the admin UI without leaking workspace state.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.reset_member_passkey(
  p_workspace_id    uuid,
  p_member_user_id  uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, cortex, directory
AS $$
DECLARE
  v_caller_user_id     uuid;
  v_caller_entity_id   uuid;
  v_target_entity_id   uuid;
  v_target_email       text;
  v_deleted            int;
BEGIN
  -- 0. Require an authenticated session.
  v_caller_user_id := auth.uid();
  IF v_caller_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  -- 1. Caller must hold owner or admin in the target workspace.
  IF NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Target must be a member of the same workspace.
  --    Prevents cross-workspace admins from touching outsiders.
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = p_member_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  -- 3. Anti-lockout: an admin cannot reset their own passkeys via this path.
  --    Self-service passkey removal belongs in settings/security.
  IF p_member_user_id = v_caller_user_id THEN
    RAISE EXCEPTION 'Not authorized to reset member access'
      USING ERRCODE = '42501';
  END IF;

  -- 4. Wipe the target's passkey registrations.
  DELETE FROM public.passkeys
   WHERE user_id = p_member_user_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  -- 5. Look up caller + target entities for the audit edge.
  --    claimed_by_user_id = auth.uid() is the canonical lookup (same pattern
  --    used by patch_relationship_context audit trail).
  SELECT id INTO v_caller_entity_id
    FROM directory.entities
   WHERE claimed_by_user_id = v_caller_user_id
   LIMIT 1;

  SELECT id INTO v_target_entity_id
    FROM directory.entities
   WHERE claimed_by_user_id = p_member_user_id
   LIMIT 1;

  -- 6. Pull target email for the server action to send the magic-link email.
  --    Uses auth.users directly — SECURITY DEFINER runs as function owner
  --    (typically postgres) so the read is allowed.
  SELECT email INTO v_target_email
    FROM auth.users
   WHERE id = p_member_user_id;

  -- 7. Write the ADMIN_ACTION audit edge. Skip silently if either entity row
  --    is missing (e.g. legacy workspaces where directory.entities has not
  --    been backfilled for every user). The passkey delete + email still
  --    proceed; the audit row is best-effort but loud in practice.
  IF v_caller_entity_id IS NOT NULL AND v_target_entity_id IS NOT NULL THEN
    -- cortex.relationships has UNIQUE (source_entity_id, target_entity_id,
    -- relationship_type). A second reset by the same admin against the same
    -- member must not raise — append the new action to context_data's history
    -- array so we keep a full audit trail per (actor, target) pair.
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

COMMENT ON FUNCTION cortex.reset_member_passkey(uuid, uuid) IS
  'Owner-mediated crew recovery. SECURITY DEFINER — owner or admin of p_workspace_id wipes a fellow member''s public.passkeys rows and writes a cortex.relationships ADMIN_ACTION edge. Returns { target_user_id, target_email, passkeys_deleted }. Caller cannot reset themselves. Never grant EXECUTE to anon. See docs/reference/login-redesign-design.md §9.';

-- Grants — MANDATORY per memory note feedback_postgres_function_grants.md.
-- This RPC deletes passkeys; if anon can call it, it is a catastrophic
-- privilege escalation. Do not remove these lines.
REVOKE ALL ON FUNCTION cortex.reset_member_passkey(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.reset_member_passkey(uuid, uuid)
  TO authenticated, service_role;

-- Audit: after running this migration, verify anon cannot execute.
--   SELECT has_function_privilege('anon',
--     'cortex.reset_member_passkey(uuid,uuid)', 'EXECUTE');
--   -- expected: false
