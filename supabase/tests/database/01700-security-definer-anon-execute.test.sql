-- Which SECURITY DEFINER functions may `anon` execute?
--
-- `CREATE FUNCTION` grants EXECUTE to PUBLIC by default, and `anon` inherits it.
-- A SECURITY DEFINER function runs as its owner, so a forgotten REVOKE hands an
-- unauthenticated caller the owner's privileges. That has already happened here
-- once, across fourteen `client_*` RPCs, fixed in 20260410160000.
--
-- The rule was written down after that and enforced by nothing: every migration
-- since has carried its own REVOKE, by hand, remembered each time. This is the
-- test that makes forgetting fail.
--
-- It is an allowlist, deliberately. A denylist of "known bad" names would pass
-- the next function somebody adds, which is the only case that matters.
--
-- Three kinds of entry are legitimate here:
--   * RLS helpers. A policy expression runs as the querying role, so a function
--     named in one must be executable by every role the policy covers.
--   * Trigger functions. Triggers execute as the table owner; the grant is
--     irrelevant, and revoking it would be noise.
--   * Genuinely public reads, which take a token rather than a session --
--     `finance.get_public_invoice` is the client-facing invoice page.
--
-- Everything on this list returns NULL or FALSE for a caller with no
-- `auth.uid()`, which is what makes it safe rather than merely intended.
-- Before adding a name, check that is true of it.

BEGIN;
SELECT plan(1);

SELECT set_eq(
  $$SELECT (n.nspname || '.' || p.proname)::text
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef
       AND p.prokind = 'f'
       AND n.nspname IN ('public','ops','finance','directory','cortex','aion')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')$$,
  ARRAY[
    -- Public, token-scoped read for the client invoice page.
    'finance.get_public_invoice',

    -- Identity / membership helpers used by RLS policies. All return NULL or
    -- FALSE when auth.uid() is NULL.
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

    -- Trigger functions. Triggers run as the table owner regardless.
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
  ],
  'anon may execute exactly the SECURITY DEFINER functions on the allowlist'
);

SELECT * FROM finish();
ROLLBACK;
