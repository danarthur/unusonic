-- Phase 2.1 Sprint 4 — set_deal_open_item_state RPC.
--
-- Single mutation entrypoint for the Conflicts panel's "Mark handled",
-- "Reopen", and "Mark resolved" actions. Upserts into ops.deal_open_items
-- with audit metadata (acted_by = auth.uid(), acted_at = now()).

CREATE OR REPLACE FUNCTION ops.set_deal_open_item_state(
  p_deal_id   uuid,
  p_item_key  text,
  p_state     text,
  p_ack_note  text DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
  v_row          ops.deal_open_items%ROWTYPE;
BEGIN
  IF p_state NOT IN ('open', 'acknowledged', 'resolved') THEN
    RAISE EXCEPTION 'invalid state %, must be open/acknowledged/resolved', p_state
      USING ERRCODE = '22023';
  END IF;
  IF p_item_key IS NULL OR LENGTH(p_item_key) = 0 THEN
    RAISE EXCEPTION 'item_key required'
      USING ERRCODE = '22023';
  END IF;

  -- Look up workspace via deal (also confirms deal exists + is unarchived).
  SELECT d.workspace_id INTO v_workspace_id
  FROM public.deals d
  WHERE d.id = p_deal_id AND d.archived_at IS NULL;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'deal not found or archived: %', p_deal_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Dual-context auth: UI requires workspace membership; service_role bypasses.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', v_workspace_id
      USING ERRCODE = '42501';
  END IF;

  INSERT INTO ops.deal_open_items
    (deal_id, workspace_id, item_key, state, ack_note, acted_by, acted_at)
  VALUES
    (p_deal_id, v_workspace_id, p_item_key, p_state, p_ack_note, auth.uid(), now())
  ON CONFLICT (deal_id, item_key) DO UPDATE
    SET state    = EXCLUDED.state,
        ack_note = COALESCE(EXCLUDED.ack_note, ops.deal_open_items.ack_note),
        acted_by = EXCLUDED.acted_by,
        acted_at = EXCLUDED.acted_at
  RETURNING * INTO v_row;

  RETURN jsonb_build_object(
    'id',       v_row.id,
    'deal_id',  v_row.deal_id,
    'item_key', v_row.item_key,
    'state',    v_row.state,
    'ack_note', v_row.ack_note,
    'acted_by', v_row.acted_by,
    'acted_at', v_row.acted_at
  );
END;
$function$;

COMMENT ON FUNCTION ops.set_deal_open_item_state(uuid, text, text, text) IS
  'Phase 2.1 Sprint 4 — upsert state machine entry for the Conflicts panel. Used for Mark handled / Reopen / Mark resolved transitions. Audit metadata (acted_by + acted_at) attached automatically.';

REVOKE EXECUTE ON FUNCTION ops.set_deal_open_item_state(uuid, text, text, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.set_deal_open_item_state(uuid, text, text, text) TO authenticated, service_role;

-- Audit
DO $$
DECLARE
  v_pub  boolean;
  v_anon boolean;
  v_path boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'ops.set_deal_open_item_state(uuid, text, text, text)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'ops.set_deal_open_item_state(uuid, text, text, text)'::regprocedure;
  SELECT proconfig IS NOT NULL INTO v_path
    FROM pg_proc WHERE oid = 'ops.set_deal_open_item_state(uuid, text, text, text)'::regprocedure;

  IF v_pub OR v_anon THEN
    RAISE EXCEPTION 'Safety audit: ops.set_deal_open_item_state leaks EXECUTE (public=% anon=%)', v_pub, v_anon;
  END IF;
  IF NOT v_path THEN
    RAISE EXCEPTION 'Safety audit: ops.set_deal_open_item_state has mutable search_path';
  END IF;
END $$;
