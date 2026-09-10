-- Creating a workspace is one transaction, or it is a mess.
--
-- `initializeOrganization` did six writes in sequence from the application and
-- undid them by hand when one failed. Compensation written by hand is wrong the
-- moment the shape changes, and this one already was:
--
--   Step 3 creates the owner's person entity with owner_workspace_id set to the
--   new workspace. Step 4 inserts workspace_members. If step 4 fails, the
--   rollback deletes the org entity and the workspace -- but not the person.
--   `directory.entities.owner_workspace_id` references workspaces(id) with no
--   ON DELETE, so that workspace DELETE raises a foreign-key violation. Its
--   result was never checked. The user is told setup failed; the workspace and
--   the person entity are still there.
--
-- That is the shape of the orphaned workspace found in production: a row with
-- no members, no entities, no deals, belonging to nobody.
--
-- Postgres already has all-or-nothing. This function uses it, so there is no
-- compensation logic left to be wrong.
--
-- It is also safe to call twice. Onboarding is a form submit on a slow request
-- -- the double-click, the impatient refresh and the client retry are all
-- ordinary -- so the function takes a transaction-level advisory lock on the
-- caller and returns the workspace they already own by that name rather than
-- making a second one.

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
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Not authenticated.');
  END IF;
  IF COALESCE(TRIM(p_name), '') = '' THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Organization name is required.');
  END IF;
  IF p_persona IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Invalid organization type.');
  END IF;

  -- One creation at a time per caller. Released at commit or rollback.
  PERFORM pg_advisory_xact_lock(hashtext('create_workspace:' || v_user_id::text));

  -- Already done. A retry gets the same workspace, not a second one.
  SELECT w.id INTO v_existing
  FROM public.workspaces w
  JOIN public.workspace_members m ON m.workspace_id = w.id
  WHERE m.user_id = v_user_id
    AND m.role = 'owner'
    AND w.name = TRIM(p_name)
  LIMIT 1;

  IF v_existing IS NOT NULL THEN
    RETURN jsonb_build_object(
      'ok', true,
      'workspace_id', v_existing,
      'already_existed', true,
      'org_entity_id', (
        SELECT e.id FROM directory.entities e
        WHERE e.owner_workspace_id = v_existing AND e.type = 'company'
        ORDER BY e.created_at LIMIT 1
      ),
      'slug', (SELECT w.slug FROM public.workspaces w WHERE w.id = v_existing)
    );
  END IF;

  -- Slug. The unique index is the authority; the check is only to keep the
  -- readable slug when it happens to be free.
  v_slug := p_slug;
  IF EXISTS (SELECT 1 FROM public.workspaces WHERE slug = v_slug) THEN
    v_slug := p_slug || '-' || substr(encode(gen_random_bytes(4), 'hex'), 1, 6);
  END IF;

  INSERT INTO public.workspaces (name, slug, subscription_tier, signalpay_enabled)
  VALUES (TRIM(p_name), v_slug, p_subscription_tier, COALESCE(p_signalpay_enabled, false))
  RETURNING id INTO v_workspace_id;

  INSERT INTO directory.entities (display_name, handle, type, owner_workspace_id, attributes)
  VALUES (
    TRIM(p_name), v_slug, 'company', v_workspace_id,
    jsonb_build_object(
      'is_ghost', false,
      'is_claimed', true,
      'organization_type', p_organization_type,
      'pms_integration_enabled', COALESCE(p_pms_integration_enabled, false)
    )
  )
  RETURNING id INTO v_org_entity_id;

  -- The owner's person entity, reused when they already have one. A person
  -- claimed by this user in another workspace stays where it is; only a user
  -- with no person at all gets a new one, owned by the workspace being made.
  SELECT id INTO v_person_id
  FROM directory.entities
  WHERE claimed_by_user_id = v_user_id AND type = 'person'
  ORDER BY created_at
  LIMIT 1;

  IF v_person_id IS NULL THEN
    INSERT INTO directory.entities (display_name, type, claimed_by_user_id, owner_workspace_id, attributes)
    VALUES (
      COALESCE(NULLIF(TRIM(p_owner_display_name), ''), p_owner_email, 'Owner'),
      'person', v_user_id, v_workspace_id,
      jsonb_build_object('email', COALESCE(p_owner_email, ''), 'is_ghost', false)
    )
    RETURNING id INTO v_person_id;
  END IF;

  -- The graph edge. Fatal here, unlike before: inside one transaction there is
  -- no half-made workspace to preserve by tolerating a failure.
  PERFORM public.upsert_relationship(
    v_person_id, v_org_entity_id, 'ROSTER_MEMBER',
    jsonb_build_object('role', 'owner', 'employment_status', 'internal_employee')
  );

  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (v_workspace_id, v_user_id, 'owner');

  UPDATE public.profiles
  SET onboarding_completed = true, onboarding_step = 3, persona = p_persona
  WHERE id = v_user_id;

  INSERT INTO public.agent_configs (workspace_id, persona, tier, xai_reasoning_enabled, agent_mode, modules_enabled)
  VALUES (
    v_workspace_id, p_persona, p_subscription_tier, true,
    CASE WHEN p_subscription_tier = 'studio' THEN 'autonomous' ELSE 'assist' END,
    p_modules_enabled
  );

  RETURN jsonb_build_object(
    'ok', true,
    'workspace_id', v_workspace_id,
    'org_entity_id', v_org_entity_id,
    'person_entity_id', v_person_id,
    'slug', v_slug,
    'already_existed', false
  );
EXCEPTION
  WHEN unique_violation THEN
    RETURN jsonb_build_object('ok', false, 'error', 'That name is already taken. Try another.');
END;
$function$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC. Say who may actually call it.
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
END $$;
