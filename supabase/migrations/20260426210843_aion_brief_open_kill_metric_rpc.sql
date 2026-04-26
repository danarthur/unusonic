-- Phase 3 §3.10 (Wk 13) — kill-metric RPC for the §3.9 brief-open feature.
--
-- Plan §3.9 U1 kill rule: "If fewer than 30% of active owners open brief-me
-- twice in a week at 90-day mark, cut in Phase 4." This RPC returns the raw
-- per-(workspace, user) repeat-open stats over a configurable window so an
-- admin can compute that percentage manually or in app code.
--
-- Input:
--   p_window_days        — lookback window for total events (default 90)
--   p_repeat_window_days — sliding window for the "twice in a week" check (default 7)
--   p_min_repeats        — minimum opens within the sliding window (default 2)
--
-- Output: one row per (workspace, user) where the max count of brief_open
-- events within ANY p_repeat_window_days slice meets p_min_repeats. Empty
-- when nobody hits the bar (which is itself the kill signal at the 90-day
-- mark). Rows include total_opens + first/last open timestamps so the admin
-- can sanity-check edge cases.
--
-- Service-role only by GRANT — the route handler also gates via
-- isAionAdmin(user.id). Belt + suspenders: even if the env var is empty,
-- non-service-role callers can't EXECUTE the RPC.

CREATE OR REPLACE FUNCTION cortex.metric_brief_open_kill_check(
  p_window_days        integer DEFAULT 90,
  p_repeat_window_days integer DEFAULT 7,
  p_min_repeats        integer DEFAULT 2
)
  RETURNS TABLE (
    workspace_id      uuid,
    user_id           uuid,
    total_opens       integer,
    max_in_window     integer,
    first_open        timestamptz,
    last_open         timestamptz
  )
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
  WITH events AS (
    SELECT
      e.workspace_id,
      e.user_id,
      e.created_at
    FROM ops.aion_events e
    WHERE e.event_type   = 'aion.brief_open'
      AND e.user_id      IS NOT NULL
      AND e.workspace_id IS NOT NULL
      AND e.created_at  >= now() - (p_window_days || ' days')::interval
  ),
  windowed AS (
    -- For each event row, count peers within the trailing repeat-window.
    -- Postgres lets us use a RANGE BETWEEN with an interval offset.
    SELECT
      workspace_id,
      user_id,
      created_at,
      count(*) OVER (
        PARTITION BY workspace_id, user_id
        ORDER BY created_at
        RANGE BETWEEN (p_repeat_window_days || ' days')::interval PRECEDING AND CURRENT ROW
      ) AS rolling_count
    FROM events
  )
  SELECT
    w.workspace_id,
    w.user_id,
    count(*)::int           AS total_opens,
    max(w.rolling_count)::int AS max_in_window,
    min(w.created_at)       AS first_open,
    max(w.created_at)       AS last_open
  FROM windowed w
  GROUP BY w.workspace_id, w.user_id
  HAVING max(w.rolling_count) >= p_min_repeats
  ORDER BY max(w.rolling_count) DESC, count(*) DESC;
$function$;

COMMENT ON FUNCTION cortex.metric_brief_open_kill_check(integer, integer, integer) IS
  'Phase 3 §3.10 — repeat-user stats for the §3.9 brief-open kill metric. Returns one row per (workspace, user) hitting >= p_min_repeats opens within any sliding p_repeat_window_days slice over the last p_window_days. Service-role only — admin route gates via isAionAdmin().';

REVOKE EXECUTE ON FUNCTION cortex.metric_brief_open_kill_check(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION cortex.metric_brief_open_kill_check(integer, integer, integer) TO service_role;

DO $$
DECLARE v_pub boolean; v_anon boolean; v_auth boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'cortex.metric_brief_open_kill_check(integer, integer, integer)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'cortex.metric_brief_open_kill_check(integer, integer, integer)'::regprocedure;
  SELECT has_function_privilege('authenticated', oid, 'EXECUTE') INTO v_auth
    FROM pg_proc WHERE oid = 'cortex.metric_brief_open_kill_check(integer, integer, integer)'::regprocedure;
  IF v_pub OR v_anon OR v_auth THEN
    RAISE EXCEPTION 'Safety audit: non-service_role still holds EXECUTE on cortex.metric_brief_open_kill_check (pub=% anon=% auth=%)',
      v_pub, v_anon, v_auth;
  END IF;
END $$;
