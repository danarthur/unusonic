-- Phase 2.1 Sprint 3 — get_archetype_role_mix RPC.
--
-- Returns the role mix for a given (workspace, archetype_slug). Sprint 3's
-- popover Pool section consumes this to know which roles to surface and in
-- what order. Sprint 4 plugs this into the composite feasibility_check_for_deal.
--
-- Sparse: returns empty pools array if the workspace has no role mix for
-- that archetype (common for custom archetypes the owner created without
-- adding a role mix yet). The popover renders a "no role mix configured"
-- honesty line in that case.

CREATE OR REPLACE FUNCTION ops.get_archetype_role_mix(
  p_workspace_id   uuid,
  p_archetype_slug text
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
DECLARE
  v_roles jsonb;
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

  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'role_tag',     arr.role_tag,
        'qty_required', arr.qty_required,
        'is_optional',  arr.is_optional,
        'notes',        arr.notes
      )
      -- Required first, then alphabetical within each group.
      ORDER BY arr.is_optional ASC, arr.role_tag ASC
    ),
    '[]'::jsonb
  )
  INTO v_roles
  FROM ops.archetype_role_requirements arr
  WHERE arr.workspace_id   = p_workspace_id
    AND arr.archetype_slug = p_archetype_slug;

  RETURN jsonb_build_object(
    'archetype_slug', p_archetype_slug,
    'roles',          v_roles,
    'total_roles',    jsonb_array_length(v_roles)
  );
END;
$function$;

COMMENT ON FUNCTION ops.get_archetype_role_mix(uuid, text) IS
  'Phase 2.1 Sprint 3 — returns the role-mix for a workspace + archetype slug. Sparse (empty roles array if no mix configured for that archetype). Required roles are surfaced before optional, alphabetical within each.';

REVOKE EXECUTE ON FUNCTION ops.get_archetype_role_mix(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.get_archetype_role_mix(uuid, text) TO authenticated, service_role;

-- Audit
DO $$
DECLARE
  v_pub  boolean;
  v_anon boolean;
  v_path boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'ops.get_archetype_role_mix(uuid, text)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'ops.get_archetype_role_mix(uuid, text)'::regprocedure;
  SELECT proconfig IS NOT NULL INTO v_path
    FROM pg_proc WHERE oid = 'ops.get_archetype_role_mix(uuid, text)'::regprocedure;

  IF v_pub OR v_anon THEN
    RAISE EXCEPTION 'Safety audit: ops.get_archetype_role_mix leaks EXECUTE (public=% anon=%)', v_pub, v_anon;
  END IF;
  IF NOT v_path THEN
    RAISE EXCEPTION 'Safety audit: ops.get_archetype_role_mix has mutable search_path';
  END IF;
END $$;
