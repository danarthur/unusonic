-- One definition of "which SECURITY DEFINER functions may anon execute".
--
-- The sweep in 20260910240000 and pgTAP 01700 both need this list, and it was
-- written out three times: twice in that migration (the sweep and its own
-- assertion) and once in the test. Three copies of a security boundary that
-- agree today and drift the first time somebody edits one of them.
--
-- Timestamped 235000 so it exists before the sweep that consumes it.
--
-- Deliberately NOT SECURITY DEFINER: a function that lists the SECURITY DEFINER
-- allowlist must not be in scope of the check it feeds. The assertion below
-- holds that still.

CREATE OR REPLACE FUNCTION public.anon_executable_secdef_allowlist()
RETURNS text[]
LANGUAGE sql
IMMUTABLE
SET search_path TO ''
AS $function$
  SELECT ARRAY[
    -- Public, token-scoped read for the client invoice page.
    'finance.get_public_invoice',

    -- Identity / membership helpers named in RLS policies. A policy expression
    -- runs as the querying role, so these must be executable by every role the
    -- policy covers. All return NULL or FALSE when auth.uid() is NULL.
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

    -- Trigger functions. A trigger executes as the table owner, so the grant is
    -- irrelevant and revoking it would be noise.
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
  ]::text[];
$function$;

COMMENT ON FUNCTION public.anon_executable_secdef_allowlist() IS
  'SECURITY DEFINER functions anon may execute, on purpose. Single source of truth for the 20260910240000 sweep and pgTAP 01700.';

DO $$
BEGIN
  IF (SELECT prosecdef FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'anon_executable_secdef_allowlist') THEN
    RAISE EXCEPTION 'the allowlist function must not be SECURITY DEFINER';
  END IF;
END $$;
