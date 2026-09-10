-- A fresh database comes up with a far wider anon surface than production.
--
-- `CREATE FUNCTION` grants EXECUTE to PUBLIC, and `anon` inherits it. The
-- migrations that closed this -- 20260410160000, 20260410170000 and their
-- service-role restore -- live in `supabase/migrations/pre-baseline/`, which is
-- NOT applied when the database is built from scratch. So production is hard
-- and every fresh build is soft, including CI, a restore, and any new
-- environment.
--
-- pgTAP 01700 measured the gap: 33 anon-executable SECURITY DEFINER functions
-- on production, 49 on a fresh build. The difference included
-- `client_mint_session_token`, `client_verify_otp`, `insert_ghost_entity`,
-- `update_ghost_member`, `claim_ghost_entities_for_user`, `complete_onboarding`
-- and `get_user_id_by_email` -- session minting, OTP verification, entity
-- creation and an email→user-id enumeration oracle, all reachable with the
-- public anon key.
--
-- This does the same work declaratively, in the folder that actually runs, so
-- fresh and production agree from now on. It is written as a sweep rather than
-- a list of names because the list has already drifted once: several functions
-- the pre-baseline migrations name have since been dropped, and a REVOKE on a
-- missing function is an error.
--
-- It does not widen anything. For each function it revokes PUBLIC and anon,
-- then restores EXECUTE to `authenticated` and `service_role` only where they
-- already had it -- which is the trap the pre-baseline pair fell into and
-- needed 20260410180000 to undo. Revoking PUBLIC is unavoidable: while PUBLIC
-- holds EXECUTE, revoking the same privilege from `anon` changes nothing.

DO $$
DECLARE
  r record;
  v_auth_had boolean;
  v_svc_had  boolean;
  v_closed   int := 0;
  -- Executable by anon on purpose. Keep in step with pgTAP 01700, which
  -- asserts the resulting set exactly.
  v_allow text[] := ARRAY[
    'finance.get_public_invoice',
    'public.client_is_workspace_client',
    'public.current_entity_id',
    'public.get_active_workspace_id',
    'public.get_current_org_id',
    'public.get_member_role_slug',
    'public.get_my_client_entity_ids',
    'public.get_my_entity_id',
    'public.get_my_organization_ids',
    'public.get_my_workspace_ids',
    'public.get_user_workspace_ids',
    'public.is_member_of',
    'public.is_workspace_member',
    'public.is_workspace_owner',
    'public.member_has_capability',
    'public.my_org_ids_admin_member',
    'public.unusonic_current_entity_email',
    'public.unusonic_current_entity_id',
    'public.unusonic_org_ids_can_affiliate',
    'public.unusonic_org_ids_for_entity',
    'public.unusonic_org_ids_where_admin',
    'public.user_has_workspace_role',
    'public.workspace_created_by_me',
    'public.client_portal_cascade_revoke_on_proposal_token_change',
    'public.cortex_relationships_audit_trail',
    'public.ensure_profile_exists',
    'public.entities_set_updated_at',
    'public.handle_new_user',
    'public.set_org_member_workspace_id',
    'public.set_talent_skill_workspace_id',
    'public.sync_gig_to_event',
    'public.sync_workspace_roles_to_app_metadata',
    'public.trigger_spine_audit'
  ];
BEGIN
  FOR r IN
    SELECT p.oid,
           p.oid::regprocedure::text AS sig,
           (n.nspname || '.' || p.proname) AS qname
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef
      AND p.prokind = 'f'
      AND n.nspname IN ('public','ops','finance','directory','cortex','aion')
      AND NOT ((n.nspname || '.' || p.proname) = ANY (v_allow))
      AND has_function_privilege('anon', p.oid, 'EXECUTE')
  LOOP
    -- Record what the roles that SHOULD keep access have, before PUBLIC goes.
    v_auth_had := has_function_privilege('authenticated', r.oid, 'EXECUTE');
    v_svc_had  := has_function_privilege('service_role',  r.oid, 'EXECUTE');

    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM anon',   r.sig);

    IF v_auth_had THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    END IF;
    IF v_svc_had THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
    END IF;

    v_closed := v_closed + 1;
  END LOOP;

  RAISE NOTICE 'revoked anon EXECUTE on % SECURITY DEFINER function(s)', v_closed;
END $$;

DO $$
DECLARE v_extra text;
BEGIN
  SELECT string_agg(n.nspname || '.' || p.proname, ', ' ORDER BY n.nspname, p.proname)
    INTO v_extra
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE p.prosecdef AND p.prokind = 'f'
    AND n.nspname IN ('public','ops','finance','directory','cortex','aion')
    AND has_function_privilege('anon', p.oid, 'EXECUTE')
    AND (n.nspname || '.' || p.proname) NOT IN (
      'finance.get_public_invoice','public.client_is_workspace_client',
      'public.current_entity_id','public.get_active_workspace_id',
      'public.get_current_org_id','public.get_member_role_slug',
      'public.get_my_client_entity_ids','public.get_my_entity_id',
      'public.get_my_organization_ids','public.get_my_workspace_ids',
      'public.get_user_workspace_ids','public.is_member_of',
      'public.is_workspace_member','public.is_workspace_owner',
      'public.member_has_capability','public.my_org_ids_admin_member',
      'public.unusonic_current_entity_email','public.unusonic_current_entity_id',
      'public.unusonic_org_ids_can_affiliate','public.unusonic_org_ids_for_entity',
      'public.unusonic_org_ids_where_admin','public.user_has_workspace_role',
      'public.workspace_created_by_me',
      'public.client_portal_cascade_revoke_on_proposal_token_change',
      'public.cortex_relationships_audit_trail','public.ensure_profile_exists',
      'public.entities_set_updated_at','public.handle_new_user',
      'public.set_org_member_workspace_id','public.set_talent_skill_workspace_id',
      'public.sync_gig_to_event','public.sync_workspace_roles_to_app_metadata',
      'public.trigger_spine_audit'
    );

  IF v_extra IS NOT NULL THEN
    RAISE EXCEPTION 'anon can still execute SECURITY DEFINER functions off the allowlist: %', v_extra;
  END IF;
END $$;
