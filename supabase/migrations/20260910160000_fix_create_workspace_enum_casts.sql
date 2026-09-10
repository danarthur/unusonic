-- `create_workspace_with_owner` raised 42804 on every real call, so first-time
-- onboarding could not create a workspace at all.
--
-- `workspaces.subscription_tier`, `profiles.persona` and `agent_configs`'
-- persona/tier are ENUM columns. 20260910080000 passed the text parameters
-- straight in. Postgres has no assignment cast from text to enum, so the first
-- INSERT aborted:
--
--   42804  column "subscription_tier" is of type subscription_tier
--          but expression is of type text
--
-- `EXCEPTION WHEN unique_violation` does not catch 42804, so it propagated out
-- of the RPC and the raw Postgres message reached the person signing up.
--
-- It shipped because the only thing ever run against it was its unauthenticated
-- guard, which returns before the first INSERT. That is a check shaped like a
-- verification that verifies nothing -- the same defect this whole branch was
-- about. `supabase/tests/database/01700-create-workspace.test.sql` now calls it
-- for real.
--
-- Two more defects fixed in the same pass:
--
-- 1. The slug-collision branch called `gen_random_bytes(4)` unqualified under
--    `SET search_path TO 'public'`. pgcrypto lives in `extensions` on this
--    project, so that raised 42883 -- for every signup whose org name
--    slugified to a taken slug. `gen_random_uuid()` is in pg_catalog and
--    resolves under any search_path, so it is used instead and pgcrypto is no
--    longer a dependency of this function.
--
-- 2. The tier arrived unvalidated. The function is SECURITY DEFINER with
--    EXECUTE granted to `authenticated`, which makes it callable directly over
--    PostgREST -- so the Zod enum in the onboarding schema was not a control,
--    it was a suggestion, and any signed-in user could have asked for 'studio'.
--    That is precisely what 20260910060000 revoked column UPDATE to prevent,
--    reintroduced two migrations later by the author of both. Tier, persona and
--    organization type are now checked against closed lists in the function,
--    the way `set_workspace_label_pack` already does for its one column.
--
--    NOTE for review: this validates the tier but still lets self-serve signup
--    choose any of the three. Whether a paid tier should be reachable without
--    the Stripe webhook having said so is a product decision, deliberately not
--    made here.

CREATE OR REPLACE FUNCTION public.create_workspace_with_owner(
  p_name text,
  p_slug text,
  p_organization_type text,
  p_subscription_tier text,
  p_persona text,
  p_owner_display_name text,
  p_owner_email text,
  p_signalpay_enabled boolean DEFAULT false,
  p_pms_integration_enabled boolean DEFAULT false,
  p_modules_enabled text[] DEFAULT ARRAY['crm', 'calendar']
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_workspace_id uuid;
  v_org_entity_id uuid;
  v_person_id uuid;
  v_slug text;
  v_existing uuid;
  v_tier public.subscription_tier;
  v_persona public.user_persona;
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated.');
  END IF;
  IF COALESCE(TRIM(p_name), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization name is required.');
  END IF;

  -- Closed lists, checked here rather than trusted from the caller.
  IF p_subscription_tier IS NULL OR p_subscription_tier NOT IN ('foundation', 'growth', 'studio') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Unknown subscription tier.');
  END IF;
  IF p_persona IS NULL OR p_persona NOT IN ('solo_professional', 'agency_team', 'venue_brand') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid organization type.');
  END IF;
  IF p_organization_type IS NULL OR p_organization_type NOT IN ('solo', 'agency', 'venue') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid organization type.');
  END IF;

  v_tier    := p_subscription_tier::public.subscription_tier;
  v_persona := p_persona::public.user_persona;

  -- One creation at a time per caller. Released at commit or rollback.
  PERFORM pg_advisory_xact_lock(hashtext('create_workspace:' || v_user_id::text));

  -- Already done. A retry gets the same workspace, not a second one.
  SELECT w.id INTO v_existing
  FROM public.workspaces w
  JOIN public.workspace_members m ON m.workspace_id = w.id
  WHERE m.user_id = v_user_id AND m.role = 'owner' AND w.name = TRIM(p_name)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true, 'workspace_id', v_existing, 'already_existed', true,
      'org_entity_id', (SELECT e.id FROM directory.entities e
                        WHERE e.owner_workspace_id = v_existing AND e.type = 'company'
                        ORDER BY e.created_at LIMIT 1),
      'slug', (SELECT w.slug FROM public.workspaces w WHERE w.id = v_existing));
  END IF;

  v_slug := p_slug;
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE slug = v_slug) THEN
    v_slug := p_slug || '-' || substr(replace(gen_random_uuid()::text, '-', ''), 1, 6);
  END IF;

  INSERT INTO public.workspaces (name, slug, subscription_tier, signalpay_enabled)
  VALUES (TRIM(p_name), v_slug, v_tier, COALESCE(p_signalpay_enabled, false))
  RETURNING id INTO v_workspace_id;

  INSERT INTO directory.entities (display_name, handle, type, owner_workspace_id, attributes)
  VALUES (TRIM(p_name), v_slug, 'company', v_workspace_id,
    jsonb_build_object('is_ghost', false, 'is_claimed', true,
      'organization_type', p_organization_type,
      'pms_integration_enabled', COALESCE(p_pms_integration_enabled, false)))
  RETURNING id INTO v_org_entity_id;

  SELECT id INTO v_person_id FROM directory.entities
  WHERE claimed_by_user_id = v_user_id AND type = 'person' ORDER BY created_at LIMIT 1;

  IF v_person_id IS NULL THEN
    INSERT INTO directory.entities (display_name, type, claimed_by_user_id, owner_workspace_id, attributes)
    VALUES (COALESCE(NULLIF(TRIM(p_owner_display_name), ''), p_owner_email, 'Owner'),
      'person', v_user_id, v_workspace_id,
      jsonb_build_object('email', COALESCE(p_owner_email, ''), 'is_ghost', false))
    RETURNING id INTO v_person_id;
  END IF;

  PERFORM public.upsert_relationship(v_person_id, v_org_entity_id, 'ROSTER_MEMBER',
    jsonb_build_object('role', 'owner', 'employment_status', 'internal_employee'));

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  UPDATE public.profiles
  SET onboarding_completed = true, onboarding_step = 3, persona = v_persona
  WHERE id = v_user_id;

  INSERT INTO public.agent_configs (workspace_id, persona, tier, xai_reasoning_enabled, agent_mode, modules_enabled)
  VALUES (v_workspace_id, v_persona, v_tier, true,
    CASE WHEN v_tier = 'studio' THEN 'autonomous' ELSE 'assist' END,
    p_modules_enabled);

  RETURN jsonb_build_object('ok', true, 'workspace_id', v_workspace_id,
    'org_entity_id', v_org_entity_id, 'person_entity_id', v_person_id,
    'slug', v_slug, 'already_existed', false);
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That name is already taken. Try another.');
  WHEN invalid_text_representation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'A value was not one this workspace accepts.');
END;
$function$;

REVOKE ALL ON FUNCTION public.create_workspace_with_owner(text, text, text, text, text, text, text, boolean, boolean, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_workspace_with_owner(text, text, text, text, text, text, text, boolean, boolean, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner(text, text, text, text, text, text, text, boolean, boolean, text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_workspace_with_owner(text, text, text, text, text, text, text, boolean, boolean, text[]) TO service_role;

DO $$
BEGIN
  IF has_function_privilege('anon',
    'public.create_workspace_with_owner(text, text, text, text, text, text, text, boolean, boolean, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute create_workspace_with_owner';
  END IF;
  IF NOT has_function_privilege('authenticated',
    'public.create_workspace_with_owner(text, text, text, text, text, text, text, boolean, boolean, text[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute create_workspace_with_owner';
  END IF;
  -- pgcrypto is not on this function's search_path; make sure nobody puts it back.
  IF pg_get_functiondef(
       'public.create_workspace_with_owner(text, text, text, text, text, text, text, boolean, boolean, text[])'::regprocedure
     ) LIKE '%gen_random_bytes%' THEN
    RAISE EXCEPTION 'create_workspace_with_owner calls gen_random_bytes, which does not resolve under its search_path';
  END IF;
END $$;
