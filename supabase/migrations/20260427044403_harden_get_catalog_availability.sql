-- Harden public.get_catalog_availability against two pre-existing sev-zero
-- patterns flagged during Phase 2 research (Signal Navigator audit, 2026-04-26):
--
--   1. SECURITY DEFINER with no SET search_path. Unqualified table references
--      (proposal_items, proposals, deals, packages) resolve via the *caller's*
--      search_path, which lets a malicious authenticated user shadow tables
--      via their own schema and have this function read fake data. Classic
--      search-path injection vector.
--
--   2. No workspace-membership check inside the body. The function trusts
--      p_workspace_id blindly. An authenticated user from workspace A can
--      pass workspace B's id and read workspace B's deals. Tenant-isolation
--      bypass.
--
-- The third issue Signal Navigator flagged (no REVOKE FROM PUBLIC, anon)
-- was a false alarm — this function was already locked down to authenticated
-- + service_role only by migration 20260410170000_revoke_anon_exec_broader_security_definer.sql.
-- Confirmed live via has_function_privilege check.
--
-- Fix:
--   * Switch LANGUAGE from sql to plpgsql so we can do the auth check + RAISE.
--   * SET search_path TO 'pg_catalog', 'public' (function reads only public schema).
--   * Schema-qualify every table reference.
--   * Add dual-context auth check (UI requires workspace membership; service_role
--     bypasses cleanly because auth.uid() returns NULL). Pattern per
--     feedback_security_definer_dual_context auto-memory.
--   * Re-assert REVOKE FROM PUBLIC, anon for explicitness.
--   * Audit DO block at the bottom enforces the grant posture.
--
-- Three callers in app code (all in src/features/sales/api/catalog-availability.ts)
-- use the SSR client which carries auth.uid(), so the auth check is transparent
-- for legitimate callers.

CREATE OR REPLACE FUNCTION public.get_catalog_availability(
  p_workspace_id uuid,
  p_date_start   date,
  p_date_end     date
)
  RETURNS TABLE (
    catalog_package_id uuid,
    deal_id            uuid,
    deal_title         text,
    deal_status        text,
    proposed_date      date,
    quantity_allocated integer,
    stock_quantity     integer
  )
  LANGUAGE plpgsql
  STABLE
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'public'
AS $function$
BEGIN
  -- Dual-context auth: when called from a UI session, require workspace
  -- membership. Service-role callers (cron, system-client paths) bypass
  -- cleanly because auth.uid() returns NULL. Same pattern as
  -- ops.feasibility_check_for_date.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    pi.origin_package_id::uuid                AS catalog_package_id,
    d.id::uuid                                AS deal_id,
    d.title::text                             AS deal_title,
    d.status::text                            AS deal_status,
    d.proposed_date::date                     AS proposed_date,
    COALESCE(pi.quantity, 1)::int             AS quantity_allocated,
    p.stock_quantity::int                     AS stock_quantity
  FROM public.proposal_items pi
  JOIN public.proposals      pr ON pr.id = pi.proposal_id
  JOIN public.deals          d  ON d.id  = pr.deal_id
  JOIN public.packages       p  ON p.id  = pi.origin_package_id
  WHERE d.workspace_id            = p_workspace_id
    AND pi.origin_package_id      IS NOT NULL
    AND p.category                = 'rental'
    AND d.proposed_date           IS NOT NULL
    AND d.proposed_date::date     BETWEEN p_date_start AND p_date_end
    AND d.status                  NOT IN ('lost', 'archived')
    AND pr.id = (
      SELECT pr2.id FROM public.proposals pr2
      WHERE pr2.deal_id = d.id
      ORDER BY pr2.created_at DESC LIMIT 1
    );
END;
$function$;

COMMENT ON FUNCTION public.get_catalog_availability(uuid, date, date) IS
  'Per-item rental allocations across deals in a date range. SECURITY DEFINER with explicit SET search_path and dual-context workspace-membership auth (UI requires membership; service_role bypasses). Hardened 2026-04-26 against search-path injection and tenant-isolation bypass.';

REVOKE EXECUTE ON FUNCTION public.get_catalog_availability(uuid, date, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.get_catalog_availability(uuid, date, date) TO authenticated, service_role;

-- Audit
DO $$
DECLARE
  v_pub_exec  boolean;
  v_anon_exec boolean;
  v_search_path_set boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub_exec
    FROM pg_proc WHERE oid = 'public.get_catalog_availability(uuid, date, date)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon_exec
    FROM pg_proc WHERE oid = 'public.get_catalog_availability(uuid, date, date)'::regprocedure;
  SELECT proconfig IS NOT NULL INTO v_search_path_set
    FROM pg_proc WHERE oid = 'public.get_catalog_availability(uuid, date, date)'::regprocedure;

  IF v_pub_exec OR v_anon_exec THEN
    RAISE EXCEPTION 'Safety audit: get_catalog_availability still leaks EXECUTE (public=% anon=%)',
      v_pub_exec, v_anon_exec;
  END IF;

  IF NOT v_search_path_set THEN
    RAISE EXCEPTION 'Safety audit: get_catalog_availability still has mutable search_path';
  END IF;
END $$;
