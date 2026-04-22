-- =============================================================================
-- Aion catalog lookup RPC — Phase 2 Sprint 1 / Week 2.
--
-- Paired tool: `lookup_catalog` in src/app/api/aion/chat/tools/knowledge.ts.
-- Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.1.2.
--
-- This RPC wraps `public.packages` (the live workspace catalog) behind a
-- SECURITY DEFINER boundary even though the underlying table is already
-- workspace-scoped via RLS. Two reasons:
--
--   1. Forward compatibility — when the catalog migrates to its own schema
--      (CLAUDE.md rule 7: `catalog` schema not PostgREST-exposed), the tool
--      surface stays identical.
--   2. Defensive discipline — if someone ever disables packages RLS during a
--      migration, SECURITY DEFINER with an explicit workspace-membership
--      check still prevents cross-workspace reads.
--
-- Grants discipline — see feedback_postgres_function_grants memory for the
-- SEV-0 incident that motivated it: EVERY new SECURITY DEFINER function must
-- REVOKE from PUBLIC/anon in the same migration.
--
-- Shape: searches packages by display name + description, scored with a light
-- ILIKE rank (exact-ish name match > name contains > description contains).
-- Returns the top N active packages. `kind` coerces between 'package' (the
-- container category) and 'item' (everything else) — 'any' is the default.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.aion_lookup_catalog(
  p_workspace_id uuid,
  p_query        text,
  p_kind         text DEFAULT 'any',
  p_limit        int  DEFAULT 5
)
RETURNS TABLE (
  id          uuid,
  name        text,
  category    text,
  price       numeric,
  description text,
  kind        text,
  rank        int
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid;
  v_cap     int;
  v_kind    text;
  v_query   text;
  v_pattern text;
BEGIN
  -- Auth + membership gate. Service-role callers are not permitted — the
  -- tool-handler path is always an authenticated user session.
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id required' USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = p_workspace_id
       AND wm.user_id      = v_user_id
  ) THEN
    -- Don't differentiate "workspace doesn't exist" from "caller isn't a
    -- member" — avoids an enumeration oracle.
    RAISE EXCEPTION 'Not a member of that workspace' USING ERRCODE = '42501';
  END IF;

  -- Hard-cap the limit (plan §3.1.2: cap 8). Bounded here so the tool can't
  -- pass a ridiculous limit and Sonnet can't accidentally blow token budget.
  v_cap := GREATEST(1, LEAST(COALESCE(p_limit, 5), 8));

  -- Normalize kind. Anything we don't recognise collapses to 'any'.
  v_kind := lower(COALESCE(NULLIF(trim(p_kind), ''), 'any'));
  IF v_kind NOT IN ('package', 'item', 'any') THEN
    v_kind := 'any';
  END IF;

  -- Trimmed query. Empty queries return the most recently updated active
  -- packages — still useful for "what do we sell" browse-style asks.
  v_query   := COALESCE(NULLIF(trim(p_query), ''), '');
  v_pattern := '%' || v_query || '%';

  RETURN QUERY
    SELECT
      p.id,
      p.name,
      p.category::text                                    AS category,
      p.price,
      p.description,
      CASE WHEN p.category = 'package' THEN 'package' ELSE 'item' END AS kind,
      CASE
        WHEN v_query = ''                                   THEN 0
        WHEN p.name ILIKE v_query                           THEN 3  -- exact name
        WHEN p.name ILIKE v_pattern                         THEN 2  -- name contains
        WHEN COALESCE(p.description,'') ILIKE v_pattern     THEN 1  -- description contains
        ELSE 0
      END                                                 AS rank
    FROM public.packages p
    WHERE p.workspace_id = p_workspace_id
      AND p.is_active    = true
      AND (
            v_kind = 'any'
         OR (v_kind = 'package' AND p.category  = 'package')
         OR (v_kind = 'item'    AND p.category <> 'package')
          )
      AND (
            v_query = ''
         OR p.name                       ILIKE v_pattern
         OR COALESCE(p.description,'')   ILIKE v_pattern
          )
    ORDER BY rank DESC NULLS LAST, p.updated_at DESC
    LIMIT v_cap;
END;
$$;

COMMENT ON FUNCTION public.aion_lookup_catalog(uuid, text, text, int) IS
  'Aion Phase 2: workspace-scoped catalog search over public.packages. SECURITY DEFINER with explicit workspace-member check. Called by the lookup_catalog tool in the Aion chat route.';

-- Grants: authenticated-only. Keep service_role off this RPC — it enforces
-- auth.uid() membership and that path is meaningless for service callers.
REVOKE ALL ON FUNCTION public.aion_lookup_catalog(uuid, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.aion_lookup_catalog(uuid, text, text, int)
  TO authenticated;
