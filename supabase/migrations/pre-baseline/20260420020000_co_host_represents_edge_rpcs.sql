-- =============================================================================
-- Client-field redesign P0 — Step 3: graph edge RPCs.
--
-- Adds four new edge types to the cortex graph and the SECURITY DEFINER RPCs
-- that write them. The `relationship_type` column on cortex.relationships is
-- text (not an enum), so no schema change is needed for the edge types
-- themselves — only the documented vocabulary expands.
--
-- Edge vocabulary (P0 additions):
--
--   CO_HOST  — person ↔ person. Two (or more) humans jointly hosting a show.
--              Modeled as a *directed pair* (one row per direction) to match
--              the existing convention used by ROSTER_MEMBER, REPRESENTS, etc.
--              context_data shape:
--                {
--                  "pairing": "romantic" | "co_host" | "family",
--                  "anniversary_date": "YYYY-MM-DD" | null
--                }
--              NOTE: per-deal display ordering lives on
--              ops.deal_stakeholders.display_order, not on the edge — the same
--              couple may book multiple deals and want different orderings.
--              Reserved key: PARTNER is held by freelancer-tier roster
--              relationships (see summonPersonGhost). Do NOT reuse it for
--              romantic partners.
--
--   REPRESENTS  — person → (person | company). Planner / EA / agent acting on
--                 behalf of a principal. Used in P2 for luxury-segment
--                 principal+representative flows; the edge type ships now so
--                 the RPC and Zod validators are available when needed.
--                 context_data shape:
--                   {
--                     "scope": "planning" | "operations" | "full",
--                     "since": "YYYY-MM-DD" | null
--                   }
--
--   BOOKS_FOR  — person → company. The corporate booking contact (e.g. the
--                executive assistant who books a CEO's company-paid travel).
--                Edge type ships now; first caller lands in P1 alongside the
--                Company-flow billing-contact split.
--                context_data shape:
--                   {
--                     "since": "YYYY-MM-DD" | null
--                   }
--
--   BILLS_FOR  — company → company. Agency / parent / cost-center pays on
--                behalf of another company. Edge type documented now; no RPC
--                ships in P0 because there are no callers until P1 — keeping
--                an unused SECURITY DEFINER function around expands the audit
--                surface unnecessarily (Critic finding N2).
--                context_data shape:
--                   {
--                     "scope": "single_deal" | "ongoing"
--                   }
--
-- Cortex write protection: cortex.relationships has SELECT-only RLS. All
-- writes go through SECURITY DEFINER RPCs. Each RPC below explicitly:
--   - Authenticates auth.uid()
--   - Verifies workspace membership
--   - Verifies both endpoint entities belong to that workspace
--   - REVOKEs EXECUTE FROM PUBLIC, anon (Postgres default-grant landmine —
--     see migration 20260410160000 for the sev-zero precedent)
--
-- All functions use SET search_path = '' (splinter rule 0011) and fully
-- qualify every identifier.
-- =============================================================================

-- ─── add_co_host_edge ────────────────────────────────────────────────────────
-- Writes the directed pair. Idempotent via ON CONFLICT on the
-- (source, target, relationship_type) unique key.

CREATE OR REPLACE FUNCTION public.add_co_host_edge(
  p_workspace_id uuid,
  p_partner_a_id uuid,
  p_partner_b_id uuid,
  p_pairing text DEFAULT 'romantic',
  p_anniversary text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_a_workspace uuid;
  v_b_workspace uuid;
  v_ctx jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'add_co_host_edge: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'add_co_host_edge: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF p_partner_a_id = p_partner_b_id THEN
    RAISE EXCEPTION 'add_co_host_edge: partner_a and partner_b must be different entities'
      USING ERRCODE = '22023';
  END IF;

  IF p_pairing NOT IN ('romantic', 'co_host', 'family') THEN
    RAISE EXCEPTION 'add_co_host_edge: invalid pairing %', p_pairing
      USING ERRCODE = '22023';
  END IF;

  -- Both endpoints must belong to the caller's workspace.
  SELECT owner_workspace_id INTO v_a_workspace FROM directory.entities WHERE id = p_partner_a_id;
  SELECT owner_workspace_id INTO v_b_workspace FROM directory.entities WHERE id = p_partner_b_id;

  IF v_a_workspace IS DISTINCT FROM p_workspace_id OR v_b_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'add_co_host_edge: both partners must belong to workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  v_ctx := jsonb_build_object(
    'pairing', p_pairing,
    'anniversary_date', p_anniversary
  );

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_partner_a_id, p_partner_b_id, 'CO_HOST', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data;

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_partner_b_id, p_partner_a_id, 'CO_HOST', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data;

  RETURN jsonb_build_object('ok', true, 'a', p_partner_a_id, 'b', p_partner_b_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text) IS
  'Writes a directed-pair CO_HOST edge between two person entities in the same workspace. context_data: {pairing, anniversary_date}. Always query as WHERE source_entity_id = $1 AND relationship_type = ''CO_HOST'' — the directed-pair convention means UNIONing both directions returns duplicates.';

-- ─── add_represents_edge ─────────────────────────────────────────────────────
-- Person -> person OR person -> company. One direction (the representative
-- represents the principal). Inverse not needed.

CREATE OR REPLACE FUNCTION public.add_represents_edge(
  p_workspace_id uuid,
  p_representative_id uuid,
  p_principal_id uuid,
  p_scope text DEFAULT 'planning',
  p_since text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_rep_workspace uuid;
  v_principal_workspace uuid;
  v_ctx jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'add_represents_edge: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'add_represents_edge: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF p_representative_id = p_principal_id THEN
    RAISE EXCEPTION 'add_represents_edge: representative and principal must differ'
      USING ERRCODE = '22023';
  END IF;

  IF p_scope NOT IN ('planning', 'operations', 'full') THEN
    RAISE EXCEPTION 'add_represents_edge: invalid scope %', p_scope
      USING ERRCODE = '22023';
  END IF;

  SELECT owner_workspace_id INTO v_rep_workspace FROM directory.entities WHERE id = p_representative_id;
  SELECT owner_workspace_id INTO v_principal_workspace FROM directory.entities WHERE id = p_principal_id;

  IF v_rep_workspace IS DISTINCT FROM p_workspace_id OR v_principal_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'add_represents_edge: both endpoints must belong to workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  v_ctx := jsonb_build_object(
    'scope', p_scope,
    'since', p_since
  );

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_representative_id, p_principal_id, 'REPRESENTS', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data;

  RETURN jsonb_build_object('ok', true, 'representative', p_representative_id, 'principal', p_principal_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_represents_edge(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_represents_edge(uuid, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_represents_edge(uuid, uuid, uuid, text, text) TO authenticated;

COMMENT ON FUNCTION public.add_represents_edge(uuid, uuid, uuid, text, text) IS
  'Writes a single REPRESENTS edge: representative acts on behalf of principal. context_data: {scope, since}.';

-- ─── add_books_for_edge ──────────────────────────────────────────────────────
-- Person -> company. The booking contact for a corporate client.

CREATE OR REPLACE FUNCTION public.add_books_for_edge(
  p_workspace_id uuid,
  p_person_id uuid,
  p_company_id uuid,
  p_since text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_person_workspace uuid;
  v_company_workspace uuid;
  v_company_type text;
  v_ctx jsonb;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'add_books_for_edge: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'add_books_for_edge: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  SELECT owner_workspace_id INTO v_person_workspace FROM directory.entities WHERE id = p_person_id;
  SELECT owner_workspace_id, type INTO v_company_workspace, v_company_type
    FROM directory.entities WHERE id = p_company_id;

  IF v_person_workspace IS DISTINCT FROM p_workspace_id OR v_company_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'add_books_for_edge: both endpoints must belong to workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF v_company_type IS DISTINCT FROM 'company' THEN
    RAISE EXCEPTION 'add_books_for_edge: target % is not a company entity (got %)', p_company_id, v_company_type
      USING ERRCODE = '22023';
  END IF;

  v_ctx := jsonb_build_object('since', p_since);

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_person_id, p_company_id, 'BOOKS_FOR', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data;

  RETURN jsonb_build_object('ok', true, 'person', p_person_id, 'company', p_company_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.add_books_for_edge(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_books_for_edge(uuid, uuid, uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_books_for_edge(uuid, uuid, uuid, text) TO authenticated;

COMMENT ON FUNCTION public.add_books_for_edge(uuid, uuid, uuid, text) IS
  'Writes a BOOKS_FOR edge: person is the booking contact for a corporate client. context_data: {since}. First caller lands in P1.';
