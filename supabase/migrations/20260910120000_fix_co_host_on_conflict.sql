-- `add_co_host_edge` has been throwing since 20260909120000 changed it from
-- replace to merge.
--
-- The only unique index on those three columns is partial:
--
--   CREATE UNIQUE INDEX relationships_current_unique
--     ON cortex.relationships (source_entity_id, target_entity_id, relationship_type)
--     WHERE ended_at IS NULL;
--
-- A bare `ON CONFLICT (cols)` cannot use a partial index. Postgres raises
-- 42P10, "there is no unique or exclusion constraint matching the ON CONFLICT
-- specification" -- at runtime, on every call. Linking a partner failed
-- outright; the edge that the whole couples feature reads was unwritable.
--
-- The inference clause has to repeat the index predicate. Every other function
-- that writes this edge already does; this one lost it in the rewrite, and the
-- pgTAP test that exists to catch exactly this (01300, "no function uses a bare
-- ON CONFLICT that the partial index cannot satisfy") was not run before the
-- change shipped.

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
SET search_path TO ''
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

  -- Merge, not replace: a status set later must survive re-linking. The
  -- `WHERE ended_at IS NULL` is the index predicate, and without it this
  -- statement does not run at all.
  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_partner_a_id, p_partner_b_id, 'CO_HOST', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type) WHERE ended_at IS NULL
  DO UPDATE SET context_data = cortex.relationships.context_data || EXCLUDED.context_data;

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_partner_b_id, p_partner_a_id, 'CO_HOST', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type) WHERE ended_at IS NULL
  DO UPDATE SET context_data = cortex.relationships.context_data || EXCLUDED.context_data;

  RETURN jsonb_build_object('ok', true, 'a', p_partner_a_id, 'b', p_partner_b_id);
END;
$function$;

-- CREATE OR REPLACE inherits the existing ACL on a database that already has
-- this function, and leaves proacl NULL on a fresh one -- where NULL means
-- PUBLIC may execute. Set it explicitly either way.
REVOKE ALL ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text) TO authenticated;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.add_co_host_edge(uuid, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute add_co_host_edge';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.add_co_host_edge(uuid, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute add_co_host_edge';
  END IF;
  -- The defect this migration exists to fix, asserted directly.
  IF (SELECT count(*) FROM regexp_matches(
        pg_get_functiondef('public.add_co_host_edge(uuid, uuid, uuid, text, text)'::regprocedure),
        'ON CONFLICT \(source_entity_id, target_entity_id, relationship_type\)\s*WHERE ended_at IS NULL', 'g')) <> 2 THEN
    RAISE EXCEPTION 'add_co_host_edge still has an ON CONFLICT the partial index cannot satisfy';
  END IF;
END $$;
