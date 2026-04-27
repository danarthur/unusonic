-- Phase 2.1 Sprint 1 — get_role_pools_summary RPC (popover-facing aggregator).
--
-- The Phase 2 popover wants to show a "Pool" section listing every role where
-- the workspace has at least one tagged entity, with per-role counts and
-- per-date commitment status. This is the popover-facing aggregate.
--
-- Composes ops.get_role_pool internally per distinct role_tag in
-- ops.crew_skills for the workspace. Sparse — only returns pools that have
-- ≥1 tagged entity. If a workspace has zero role_tag rows, returns an empty
-- array and the popover renders the "no roles tagged yet" honesty state.
--
-- Future use: the same shape feeds the Phase 2 Conflicts panel Crew sub-section.
-- Sprint 4's feasibility_check_for_deal will compose this further.

CREATE OR REPLACE FUNCTION ops.get_role_pools_summary(
  p_workspace_id uuid,
  p_date         date DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
DECLARE
  v_role_tags text[];
  v_pools     jsonb := '[]'::jsonb;
  v_role      text;
  v_pool      jsonb;
BEGIN
  -- Dual-context auth.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Distinct role_tags that have ≥1 entity tagged in this workspace.
  SELECT array_agg(DISTINCT role_tag ORDER BY role_tag)
  INTO v_role_tags
  FROM ops.crew_skills
  WHERE workspace_id = p_workspace_id
    AND role_tag IS NOT NULL;

  IF v_role_tags IS NULL OR array_length(v_role_tags, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'pools',       '[]'::jsonb,
      'total_pools', 0
    );
  END IF;

  -- Compose per-role pools by calling get_role_pool. Inside this SECURITY
  -- DEFINER context, the inner call inherits the same elevated privileges,
  -- so the inner auth check is short-circuited (auth.uid() check passes
  -- because membership was verified at the outer level).
  FOREACH v_role IN ARRAY v_role_tags LOOP
    v_pool := ops.get_role_pool(p_workspace_id, v_role, p_date);
    v_pools := v_pools || jsonb_build_array(v_pool);
  END LOOP;

  RETURN jsonb_build_object(
    'pools',       v_pools,
    'total_pools', jsonb_array_length(v_pools)
  );
END;
$function$;

COMMENT ON FUNCTION ops.get_role_pools_summary(uuid, date) IS
  'Phase 2.1 — popover-facing aggregate of all populated role pools in a workspace, with per-date commitment status. Sparse: only returns pools with ≥1 tagged entity. Composes ops.get_role_pool internally.';

REVOKE EXECUTE ON FUNCTION ops.get_role_pools_summary(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.get_role_pools_summary(uuid, date) TO authenticated, service_role;

-- Audit
DO $$
DECLARE
  v_pub  boolean;
  v_anon boolean;
  v_path boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'ops.get_role_pools_summary(uuid, date)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'ops.get_role_pools_summary(uuid, date)'::regprocedure;
  SELECT proconfig IS NOT NULL INTO v_path
    FROM pg_proc WHERE oid = 'ops.get_role_pools_summary(uuid, date)'::regprocedure;

  IF v_pub OR v_anon THEN
    RAISE EXCEPTION 'Safety audit: ops.get_role_pools_summary leaks EXECUTE (public=% anon=%)', v_pub, v_anon;
  END IF;
  IF NOT v_path THEN
    RAISE EXCEPTION 'Safety audit: ops.get_role_pools_summary has mutable search_path';
  END IF;
END $$;
