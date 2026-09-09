-- CO_HOST edges gain a status and an end date.
--
-- Blackbaud publishes the rule for this and it is worth stating outright:
-- to keep a relationship for historical reference, such as if a couple
-- divorces, add an end date rather than delete it. NPSP does the same with a
-- Status enum and renders ended relationships as "(Former)".
--
-- Divorce is not an edge case in wedding software. Deleting the edge deletes
-- the reason a past deal had two names on it -- the show still happened, the
-- invoice still names both, and a record that quietly forgets why stops being
-- able to explain its own history.
--
--   status IS absent  -- current. Every existing row reads this way.
--   'current'         -- explicit, written when a former pair is restored.
--   'former'          -- ended. Rendered as Former, never hidden.
--   ended_on          -- the date, when someone gave one.
--
-- Absent-means-current is deliberate: no backfill, no row moves, and nothing
-- that exists today changes meaning.

-- ── add_co_host_edge: merge, do not replace ─────────────────────────────────
--
-- The existing function builds context_data fresh and, on conflict, replaces
-- it outright. Once status lives in that object, a couple booking a second
-- show after being marked former would have the status silently wiped back to
-- current by the new deal. So the upsert merges: the new pairing and
-- anniversary win, and any key this function does not write survives.
--
-- CREATE OR REPLACE at the identical signature, so no overload is created --
-- adding a defaulted parameter would have made a second, still-resolvable
-- function rather than replacing this one.

CREATE OR REPLACE FUNCTION public.add_co_host_edge(
  p_workspace_id uuid,
  p_partner_a_id uuid,
  p_partner_b_id uuid,
  p_pairing text DEFAULT 'romantic'::text,
  p_anniversary text DEFAULT NULL::text
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
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

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_partner_a_id, p_partner_b_id, 'CO_HOST', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = cortex.relationships.context_data || EXCLUDED.context_data;

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_partner_b_id, p_partner_a_id, 'CO_HOST', v_ctx)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = cortex.relationships.context_data || EXCLUDED.context_data;

  RETURN jsonb_build_object('ok', true, 'a', p_partner_a_id, 'b', p_partner_b_id);
END;
$$;

-- ── set_co_host_status ──────────────────────────────────────────────────────
--
-- Both directions in one call. The edge is stored twice, once per direction,
-- and a status on one row only would mean the same pair read as current from
-- one partner's record and former from the other's.

CREATE FUNCTION public.set_co_host_status(
  p_workspace_id uuid,
  p_partner_a_id uuid,
  p_partner_b_id uuid,
  p_status text,
  p_ended_on text DEFAULT NULL::text
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_user_id uuid;
  v_a_workspace uuid;
  v_b_workspace uuid;
  v_patch jsonb;
  v_rows int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'set_co_host_status: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'set_co_host_status: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF p_status NOT IN ('current', 'former') THEN
    RAISE EXCEPTION 'set_co_host_status: invalid status %', p_status
      USING ERRCODE = '22023';
  END IF;

  SELECT owner_workspace_id INTO v_a_workspace FROM directory.entities WHERE id = p_partner_a_id;
  SELECT owner_workspace_id INTO v_b_workspace FROM directory.entities WHERE id = p_partner_b_id;

  IF v_a_workspace IS DISTINCT FROM p_workspace_id OR v_b_workspace IS DISTINCT FROM p_workspace_id THEN
    RAISE EXCEPTION 'set_co_host_status: both partners must belong to workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Restoring clears the date rather than leaving a stale one behind.
  v_patch := jsonb_build_object(
    'status', p_status,
    'ended_on', CASE WHEN p_status = 'former' THEN p_ended_on ELSE NULL END
  );

  UPDATE cortex.relationships
  SET context_data = context_data || v_patch
  WHERE relationship_type = 'CO_HOST'
    AND (
      (source_entity_id = p_partner_a_id AND target_entity_id = p_partner_b_id)
      OR (source_entity_id = p_partner_b_id AND target_entity_id = p_partner_a_id)
    );

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'No CO_HOST edge between those two.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'updated', v_rows);
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which on a fresh
-- database leaves this callable by anon. A rewrite inherits production's ACL
-- and hides that, so both functions state their grants outright rather than
-- assuming them.
REVOKE ALL ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.add_co_host_edge(uuid, uuid, uuid, text, text)
  TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.set_co_host_status(uuid, uuid, uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_co_host_status(uuid, uuid, uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_co_host_status(uuid, uuid, uuid, text, text)
  TO authenticated, service_role;

-- Fail the migration rather than ship a hole.
DO $$
BEGIN
  IF has_function_privilege('anon', 'public.add_co_host_edge(uuid, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'add_co_host_edge is executable by anon';
  END IF;
  IF has_function_privilege('anon', 'public.set_co_host_status(uuid, uuid, uuid, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'set_co_host_status is executable by anon';
  END IF;
  IF (SELECT count(*) FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'public' AND p.proname = 'add_co_host_edge') <> 1 THEN
    RAISE EXCEPTION 'add_co_host_edge has more than one overload';
  END IF;
END $$;

COMMENT ON FUNCTION public.set_co_host_status(uuid, uuid, uuid, text, text) IS
  'Mark a CO_HOST pair current or former. Writes both direction rows. Former keeps the edge — see docs/couples-and-linked-people.md §C2.';
