-- =============================================================================
-- Phase 3.2: Pin storage for Lobby analytics cards.
--
-- Adds the 'lobby_pin' scope to cortex.aion_memory and ships five SECURITY
-- DEFINER RPCs for the pin lifecycle: save, list, update_value (cron),
-- delete, reorder. Mutations go through RPC — direct INSERT/UPDATE/DELETE
-- on cortex.aion_memory remains RLS-blocked.
--
-- Notes:
--   - 'lobby_pin' rows require user_id NOT NULL (asserted inside save RPC).
--     Existing scopes keep user_id nullable — we don't change the column.
--   - metadata JSONB column holds: metric_id, args, args_hash,
--     refresh_cadence, last_value, last_refreshed_at, position.
--   - Pins are deduped on (workspace_id, user_id, metric_id, args_hash).
--   - Per-user cap: 12 pins — save RPC raises when exceeded.
--   - Every RPC explicitly REVOKEs EXECUTE from PUBLIC, anon in the same
--     migration (postgres grants default to PUBLIC).
-- =============================================================================


-- ── Schema changes ──────────────────────────────────────────────────────────

ALTER TABLE cortex.aion_memory
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

ALTER TABLE cortex.aion_memory
  DROP CONSTRAINT IF EXISTS aion_memory_scope_check;
ALTER TABLE cortex.aion_memory
  ADD CONSTRAINT aion_memory_scope_check
  CHECK (scope IN ('episodic', 'procedural', 'semantic', 'lobby_pin'));

CREATE INDEX IF NOT EXISTS idx_aion_memory_lobby_pins
  ON cortex.aion_memory (workspace_id, user_id)
  WHERE scope = 'lobby_pin';


-- ── Membership guard (sibling to finance._metric_assert_membership) ────────

CREATE OR REPLACE FUNCTION cortex._pin_assert_membership(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'public', 'pg_temp'
AS $$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT (p_workspace_id = ANY(SELECT get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'Not a member of workspace %', p_workspace_id USING ERRCODE = '42501';
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex._pin_assert_membership(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex._pin_assert_membership(uuid) TO authenticated, service_role;


-- ── Canonical args-hash helper ─────────────────────────────────────────────
-- Hash over a stable JSON serialization so { a:1, b:2 } and { b:2, a:1 } collapse.
-- We rely on jsonb's canonical text representation for determinism.

CREATE OR REPLACE FUNCTION cortex._pin_args_hash(p_args jsonb)
RETURNS text
LANGUAGE sql IMMUTABLE SET search_path = 'pg_temp'
AS $$
  SELECT md5(COALESCE(p_args::text, '{}'));
$$;

REVOKE EXECUTE ON FUNCTION cortex._pin_args_hash(jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex._pin_args_hash(jsonb) TO authenticated, service_role;


-- =============================================================================
-- 1. save_lobby_pin — upsert by (workspace_id, user_id, metric_id, args_hash).
--    Enforces 12-pin-per-user cap. Returns the pin id (newly created or
--    existing). Initial value is recorded at pin time; refresh cron owns
--    subsequent writes via update_lobby_pin_value.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.save_lobby_pin(
  p_workspace_id uuid,
  p_user_id uuid,
  p_title text,
  p_metric_id text,
  p_args jsonb,
  p_cadence text,
  p_initial_value jsonb
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'cortex', 'public', 'pg_temp'
AS $$
DECLARE
  v_pin_id uuid;
  v_args_hash text;
  v_existing_count int;
  v_next_position int;
BEGIN
  -- Guards ---------------------------------------------------------------
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'lobby_pin scope requires user_id' USING ERRCODE = '22004';
  END IF;
  IF p_cadence NOT IN ('live', 'hourly', 'daily', 'manual') THEN
    RAISE EXCEPTION 'Invalid cadence %', p_cadence USING ERRCODE = '22023';
  END IF;
  IF COALESCE(trim(p_title), '') = '' THEN
    RAISE EXCEPTION 'Pin title required' USING ERRCODE = '22004';
  END IF;
  IF COALESCE(trim(p_metric_id), '') = '' THEN
    RAISE EXCEPTION 'metric_id required' USING ERRCODE = '22004';
  END IF;

  PERFORM cortex._pin_assert_membership(p_workspace_id);

  v_args_hash := cortex._pin_args_hash(p_args);

  -- Upsert by (workspace, user, metric, args_hash) -----------------------
  SELECT id INTO v_pin_id
  FROM cortex.aion_memory
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND scope = 'lobby_pin'
    AND metadata->>'metric_id' = p_metric_id
    AND metadata->>'args_hash' = v_args_hash
  LIMIT 1;

  IF v_pin_id IS NOT NULL THEN
    -- Existing pin: refresh last_value + last_refreshed_at, keep position.
    UPDATE cortex.aion_memory
       SET fact = p_title,
           metadata = metadata
             || jsonb_build_object(
               'last_value', p_initial_value,
               'last_refreshed_at', now(),
               'refresh_cadence', p_cadence,
               'args', p_args
             ),
           updated_at = now()
     WHERE id = v_pin_id;

    RETURN v_pin_id;
  END IF;

  -- New pin: enforce per-user cap ---------------------------------------
  SELECT count(*) INTO v_existing_count
  FROM cortex.aion_memory
  WHERE workspace_id = p_workspace_id
    AND user_id = p_user_id
    AND scope = 'lobby_pin';

  IF v_existing_count >= 12 THEN
    RAISE EXCEPTION 'Pin cap reached (12 pins per user)' USING ERRCODE = '23514';
  END IF;

  v_next_position := v_existing_count; -- 0-indexed, append to end.

  INSERT INTO cortex.aion_memory (
    workspace_id, user_id, scope, fact, source, metadata
  ) VALUES (
    p_workspace_id,
    p_user_id,
    'lobby_pin',
    p_title,
    'aion_chat',
    jsonb_build_object(
      'metric_id', p_metric_id,
      'args', p_args,
      'args_hash', v_args_hash,
      'refresh_cadence', p_cadence,
      'last_value', p_initial_value,
      'last_refreshed_at', now(),
      'position', v_next_position
    )
  )
  RETURNING id INTO v_pin_id;

  RETURN v_pin_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.save_lobby_pin(uuid, uuid, text, text, jsonb, text, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.save_lobby_pin(uuid, uuid, text, text, jsonb, text, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION cortex.save_lobby_pin IS
  'Upsert a Lobby pin for (workspace, user, metric, args_hash). Caps at 12 pins per user. Updates last_value + last_refreshed_at when the pin already exists.';


-- =============================================================================
-- 2. list_lobby_pins — returns ordered pins for (workspace, user).
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.list_lobby_pins(
  p_workspace_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  pin_id uuid,
  title text,
  metric_id text,
  args jsonb,
  cadence text,
  last_value jsonb,
  last_refreshed_at timestamptz,
  "position" int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = 'cortex', 'public', 'pg_temp'
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '22004';
  END IF;
  PERFORM cortex._pin_assert_membership(p_workspace_id);

  RETURN QUERY
  SELECT
    m.id AS pin_id,
    m.fact AS title,
    (m.metadata->>'metric_id')::text AS metric_id,
    COALESCE(m.metadata->'args', '{}'::jsonb) AS args,
    COALESCE(m.metadata->>'refresh_cadence', 'manual')::text AS cadence,
    COALESCE(m.metadata->'last_value', '{}'::jsonb) AS last_value,
    NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz AS last_refreshed_at,
    COALESCE((m.metadata->>'position')::int, 0) AS position
  FROM cortex.aion_memory m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = p_user_id
    AND m.scope = 'lobby_pin'
  ORDER BY COALESCE((m.metadata->>'position')::int, 0) ASC, m.created_at ASC;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.list_lobby_pins(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.list_lobby_pins(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION cortex.list_lobby_pins IS
  'Return Lobby pins for a given (workspace, user) in position order.';


-- =============================================================================
-- 3. update_lobby_pin_value — writes new last_value + last_refreshed_at.
--    Used by Phase 3.3 pin-refresh cron.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.update_lobby_pin_value(
  p_pin_id uuid,
  p_value jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'cortex', 'public', 'pg_temp'
AS $$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM cortex.aion_memory
  WHERE id = p_pin_id AND scope = 'lobby_pin';

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Pin % not found', p_pin_id USING ERRCODE = '02000';
  END IF;

  PERFORM cortex._pin_assert_membership(v_workspace_id);

  UPDATE cortex.aion_memory
     SET metadata = metadata
       || jsonb_build_object(
         'last_value', p_value,
         'last_refreshed_at', now()
       ),
       updated_at = now()
   WHERE id = p_pin_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.update_lobby_pin_value(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.update_lobby_pin_value(uuid, jsonb) TO authenticated, service_role;

COMMENT ON FUNCTION cortex.update_lobby_pin_value IS
  'Write a new last_value + last_refreshed_at onto a pin. Used by Phase 3.3 refresh cron.';


-- =============================================================================
-- 4. delete_lobby_pin — removes a pin.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.delete_lobby_pin(
  p_pin_id uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'cortex', 'public', 'pg_temp'
AS $$
DECLARE
  v_workspace_id uuid;
  v_user_id uuid;
BEGIN
  SELECT workspace_id, user_id INTO v_workspace_id, v_user_id
  FROM cortex.aion_memory
  WHERE id = p_pin_id AND scope = 'lobby_pin';

  IF v_workspace_id IS NULL THEN
    -- Silent success on missing — idempotent for the UI.
    RETURN;
  END IF;

  PERFORM cortex._pin_assert_membership(v_workspace_id);

  -- Authenticated callers may only delete their own pins.
  IF auth.uid() IS NOT NULL AND v_user_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot delete another user''s pin' USING ERRCODE = '42501';
  END IF;

  DELETE FROM cortex.aion_memory WHERE id = p_pin_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.delete_lobby_pin(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.delete_lobby_pin(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION cortex.delete_lobby_pin IS
  'Delete a Lobby pin. Authenticated callers may only delete their own pins.';


-- =============================================================================
-- 5. reorder_lobby_pins — takes an ordered uuid[] of pin_ids and rewrites
--    metadata.position for each. Ids not owned by (workspace, user) are
--    silently skipped.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.reorder_lobby_pins(
  p_workspace_id uuid,
  p_user_id uuid,
  p_ids uuid[]
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'cortex', 'public', 'pg_temp'
AS $$
DECLARE
  v_id uuid;
  v_idx int := 0;
BEGIN
  IF p_user_id IS NULL THEN
    RAISE EXCEPTION 'user_id required' USING ERRCODE = '22004';
  END IF;
  PERFORM cortex._pin_assert_membership(p_workspace_id);

  FOREACH v_id IN ARRAY p_ids LOOP
    UPDATE cortex.aion_memory
       SET metadata = metadata || jsonb_build_object('position', v_idx),
           updated_at = now()
     WHERE id = v_id
       AND workspace_id = p_workspace_id
       AND user_id = p_user_id
       AND scope = 'lobby_pin';
    v_idx := v_idx + 1;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.reorder_lobby_pins(uuid, uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.reorder_lobby_pins(uuid, uuid, uuid[]) TO authenticated, service_role;

COMMENT ON FUNCTION cortex.reorder_lobby_pins IS
  'Rewrite metadata.position for each of the given pin ids. Entries not owned by (workspace, user) are skipped.';
