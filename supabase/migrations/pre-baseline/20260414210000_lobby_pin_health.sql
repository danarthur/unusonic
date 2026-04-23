-- =============================================================================
-- Phase 5.3: surface pin health signals to the Lobby.
--
-- Three RPCs:
--   1. cortex.mark_lobby_pin_failure — service-role: records metadata.last_error
--      on a pin without clobbering last_value. Closes the deferred failure path
--      in src/app/api/cron/pin-refresh/route.ts (recordFailure).
--   2. cortex.record_lobby_pin_view — authenticated: writes metadata.last_viewed_at.
--      Called via server action when a pin card enters the viewport.
--   3. cortex.list_lobby_pin_health — authenticated: returns the health sidecar
--      (last_viewed_at, last_error) for a (workspace, user). Used by the widget
--      to compute staleness + render the error chip without touching the
--      Phase 3.2 list_lobby_pins RPC.
--
-- All three follow the postgres-function-grants rule: REVOKE FROM PUBLIC, anon
-- immediately, then GRANT to the minimum caller set.
-- =============================================================================


-- ── 1. mark_lobby_pin_failure ───────────────────────────────────────────────
-- Merges { last_error: { message, at } } onto metadata. Service-role only:
-- the pin-refresh cron is the sole caller, and we don't want clients to be
-- able to plant fake error chips on each other's pins.

CREATE OR REPLACE FUNCTION cortex.mark_lobby_pin_failure(
  p_pin_id uuid,
  p_error_message text,
  p_error_at timestamptz DEFAULT now()
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'cortex', 'public', 'pg_temp'
AS $$
BEGIN
  UPDATE cortex.aion_memory
  SET metadata = metadata || jsonb_build_object(
    'last_error', jsonb_build_object(
      'message', COALESCE(p_error_message, ''),
      'at', p_error_at
    )
  )
  WHERE id = p_pin_id AND scope = 'lobby_pin';
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.mark_lobby_pin_failure(uuid, text, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.mark_lobby_pin_failure(uuid, text, timestamptz) TO service_role;

COMMENT ON FUNCTION cortex.mark_lobby_pin_failure IS
  'Record a refresh failure on a pin as metadata.last_error without touching last_value. Service role only (used by Phase 3.3 pin-refresh cron).';


-- ── 2. record_lobby_pin_view ────────────────────────────────────────────────
-- Writes metadata.last_viewed_at = now(). Ownership enforced via auth.uid().
-- Silent no-op if the pin doesn't exist — view tracking is best-effort.

CREATE OR REPLACE FUNCTION cortex.record_lobby_pin_view(p_pin_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'cortex', 'public', 'pg_temp'
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  SELECT user_id INTO v_user_id
  FROM cortex.aion_memory
  WHERE id = p_pin_id AND scope = 'lobby_pin';

  IF v_user_id IS NULL THEN
    RETURN;  -- pin doesn't exist; silent no-op.
  END IF;

  IF auth.uid() IS NOT NULL AND auth.uid() <> v_user_id THEN
    RAISE EXCEPTION 'Not authorized to record view on pin %', p_pin_id
      USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_memory
  SET metadata = metadata || jsonb_build_object('last_viewed_at', now())
  WHERE id = p_pin_id AND scope = 'lobby_pin';
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.record_lobby_pin_view(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.record_lobby_pin_view(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION cortex.record_lobby_pin_view IS
  'Record a view timestamp on a Lobby pin. Ownership enforced via auth.uid(); silent no-op on missing pin.';


-- ── 3. list_lobby_pin_health ────────────────────────────────────────────────
-- Sidecar read for (workspace, user) — returns the health subset of metadata
-- without duplicating list_lobby_pins. Widget fetches both and merges.

CREATE OR REPLACE FUNCTION cortex.list_lobby_pin_health(
  p_workspace_id uuid,
  p_user_id uuid
)
RETURNS TABLE (
  pin_id uuid,
  last_viewed_at timestamptz,
  last_error_message text,
  last_error_at timestamptz
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
    NULLIF(m.metadata->>'last_viewed_at', '')::timestamptz AS last_viewed_at,
    NULLIF(m.metadata#>>'{last_error,message}', '')::text AS last_error_message,
    NULLIF(m.metadata#>>'{last_error,at}', '')::timestamptz AS last_error_at
  FROM cortex.aion_memory m
  WHERE m.workspace_id = p_workspace_id
    AND m.user_id = p_user_id
    AND m.scope = 'lobby_pin';
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.list_lobby_pin_health(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.list_lobby_pin_health(uuid, uuid) TO authenticated, service_role;

COMMENT ON FUNCTION cortex.list_lobby_pin_health IS
  'Returns (last_viewed_at, last_error) sidecar data for a users pins. Used by the Lobby widget to compute staleness and render the refresh-error chip.';
