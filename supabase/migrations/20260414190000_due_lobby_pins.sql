-- =============================================================================
-- Phase 3.3: helper RPC for the pin-refresh cron.
--
-- cortex.due_lobby_pins(p_limit) returns the oldest-refreshed lobby pins that
-- are due according to their cadence:
--   hourly → last_refreshed_at < now() - 55 minutes
--   daily  → last_refreshed_at < now() - 23 hours
--   live   → last_refreshed_at < now() - 5 minutes (rate cap for live cadence)
--   manual → never eligible
--
-- service_role-only per our SECURITY DEFINER + REVOKE pattern. Called from
-- src/app/api/cron/pin-refresh/route.ts after bearer-token check.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.due_lobby_pins(p_limit int DEFAULT 200)
RETURNS TABLE (
  pin_id uuid,
  workspace_id uuid,
  user_id uuid,
  metric_id text,
  args jsonb,
  cadence text,
  last_refreshed_at timestamptz
)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'cortex', 'pg_temp'
AS $$
  WITH due AS (
    SELECT m.id, m.workspace_id, m.user_id, m.metadata
    FROM cortex.aion_memory m
    WHERE m.scope = 'lobby_pin'
      AND (
        (m.metadata->>'refresh_cadence' = 'hourly'
          AND COALESCE(NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz, 'epoch'::timestamptz)
              < now() - INTERVAL '55 minutes')
        OR
        (m.metadata->>'refresh_cadence' = 'daily'
          AND COALESCE(NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz, 'epoch'::timestamptz)
              < now() - INTERVAL '23 hours')
        OR
        (m.metadata->>'refresh_cadence' = 'live'
          AND COALESCE(NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz, 'epoch'::timestamptz)
              < now() - INTERVAL '5 minutes')
      )
    ORDER BY COALESCE(NULLIF(m.metadata->>'last_refreshed_at', '')::timestamptz, 'epoch'::timestamptz) ASC
    LIMIT GREATEST(p_limit, 1)
  )
  SELECT
    d.id AS pin_id,
    d.workspace_id,
    d.user_id,
    (d.metadata->>'metric_id')::text AS metric_id,
    COALESCE(d.metadata->'args', '{}'::jsonb) AS args,
    (d.metadata->>'refresh_cadence')::text AS cadence,
    NULLIF(d.metadata->>'last_refreshed_at', '')::timestamptz AS last_refreshed_at
  FROM due d;
$$;

REVOKE EXECUTE ON FUNCTION cortex.due_lobby_pins(int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.due_lobby_pins(int) TO service_role;

COMMENT ON FUNCTION cortex.due_lobby_pins(int) IS
  'Returns up to p_limit lobby pins due for refresh (hourly, daily, live cadences). Oldest last_refreshed_at first. Service role only — used by the pin-refresh cron.';
