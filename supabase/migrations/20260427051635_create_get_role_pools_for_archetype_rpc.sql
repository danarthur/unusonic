-- Phase 2.1 Sprint 3 — get_role_pools_for_archetype RPC.
--
-- Archetype-aware pool aggregator. Returns one entry per role in the
-- archetype's role mix, with the role's pool data + qty_required + is_optional
-- decoration. Surfaces zero-entity pools too (so the popover can show
-- "Not set up — tag your DJs in roster" honesty lines on required roles).
--
-- This is the popover's archetype-aware path. The non-archetype path stays
-- on ops.get_role_pools_summary (sparse — only populated pools).
--
-- Composes get_role_pool internally per role in the mix. If the mix is empty
-- (custom archetype with no row), returns empty pools array.

CREATE OR REPLACE FUNCTION ops.get_role_pools_for_archetype(
  p_workspace_id   uuid,
  p_archetype_slug text,
  p_date           date DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
DECLARE
  v_pools     jsonb := '[]'::jsonb;
  v_role      record;
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

  -- For each role in the archetype's mix, compose a pool entry. Required
  -- roles surface first (ORDER BY is_optional ASC, role_tag ASC).
  FOR v_role IN
    SELECT role_tag, qty_required, is_optional
    FROM ops.archetype_role_requirements
    WHERE workspace_id   = p_workspace_id
      AND archetype_slug = p_archetype_slug
    ORDER BY is_optional ASC, role_tag ASC
  LOOP
    -- Inner call inherits SECURITY DEFINER context so the auth check is
    -- short-circuited (membership verified at outer level).
    v_pool := ops.get_role_pool(p_workspace_id, v_role.role_tag, p_date);

    -- Decorate pool entry with archetype-specific metadata.
    v_pool := v_pool
      || jsonb_build_object(
        'qty_required', v_role.qty_required,
        'is_optional',  v_role.is_optional
      );

    v_pools := v_pools || jsonb_build_array(v_pool);
  END LOOP;

  RETURN jsonb_build_object(
    'archetype_slug', p_archetype_slug,
    'pools',          v_pools,
    'total_pools',    jsonb_array_length(v_pools)
  );
END;
$function$;

COMMENT ON FUNCTION ops.get_role_pools_for_archetype(uuid, text, date) IS
  'Phase 2.1 Sprint 3 — archetype-aware pool aggregator. Returns one entry per role in the archetype role mix, with pool data + qty_required + is_optional decoration. Surfaces zero-entity pools (popover renders honesty empty state on required roles).';

REVOKE EXECUTE ON FUNCTION ops.get_role_pools_for_archetype(uuid, text, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.get_role_pools_for_archetype(uuid, text, date) TO authenticated, service_role;

-- Audit
DO $$
DECLARE
  v_pub  boolean;
  v_anon boolean;
  v_path boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'ops.get_role_pools_for_archetype(uuid, text, date)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'ops.get_role_pools_for_archetype(uuid, text, date)'::regprocedure;
  SELECT proconfig IS NOT NULL INTO v_path
    FROM pg_proc WHERE oid = 'ops.get_role_pools_for_archetype(uuid, text, date)'::regprocedure;

  IF v_pub OR v_anon THEN
    RAISE EXCEPTION 'Safety audit: ops.get_role_pools_for_archetype leaks EXECUTE (public=% anon=%)', v_pub, v_anon;
  END IF;
  IF NOT v_path THEN
    RAISE EXCEPTION 'Safety audit: ops.get_role_pools_for_archetype has mutable search_path';
  END IF;
END $$;
