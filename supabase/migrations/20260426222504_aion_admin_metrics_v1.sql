-- Phase 3 §3.10 — Wk 15a admin metrics. Four new SECURITY DEFINER functions
-- in the aion.* namespace, each REVOKEd from PUBLIC/anon/authenticated and
-- GRANTed only to service_role. The /api/aion/admin/metrics route gates
-- via isAionAdmin() before invoking; belt-and-suspenders against the
-- service-role-only grant.
--
-- Reads cross-workspace by design — admin metrics aggregate over every
-- workspace. cortex.aion_proactive_lines for dismiss/hit, ops.aion_events
-- for tool_depth + pill_click_through.

-- 1. aion.metric_dismiss_rate — per-signal_type cross-workspace dismiss rate
--    (filtered to dismiss_reason='not_useful' per plan §3.7 C4 framing).
CREATE OR REPLACE FUNCTION aion.metric_dismiss_rate(
  p_window_days int DEFAULT 30,
  p_min_sample  int DEFAULT 20
)
  RETURNS TABLE (
    signal_type         text,
    total_emitted       int,
    not_useful_count    int,
    not_useful_rate     numeric,
    above_threshold     boolean
  )
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
  WITH base AS (
    SELECT
      l.signal_type AS sig,
      count(*) AS total,
      count(*) FILTER (WHERE l.dismiss_reason = 'not_useful') AS not_useful
    FROM cortex.aion_proactive_lines l
    WHERE l.created_at >= now() - (p_window_days || ' days')::interval
    GROUP BY l.signal_type
  )
  SELECT
    b.sig::text,
    b.total::int,
    b.not_useful::int,
    CASE WHEN b.total > 0 THEN round(b.not_useful::numeric / b.total, 4) ELSE 0 END,
    (b.total >= p_min_sample
       AND b.not_useful::numeric / NULLIF(b.total, 0) > 0.35)
  FROM base b
  ORDER BY b.total DESC;
$function$;

COMMENT ON FUNCTION aion.metric_dismiss_rate(int, int) IS
  'Wk 15a admin metric. Cross-workspace dismiss rate per signal_type over a configurable window. above_threshold = legacy 35% gate (not_useful only). Plan §3.7 C4 + §3.10 card 2.';

-- 2. aion.metric_hit_rate — per-signal_type "already_handled" rate (positive
--    signal — high hit_rate means the proactive line is catching real things
--    the owner was about to act on anyway).
CREATE OR REPLACE FUNCTION aion.metric_hit_rate(
  p_window_days int DEFAULT 30,
  p_min_sample  int DEFAULT 20
)
  RETURNS TABLE (
    signal_type             text,
    total_emitted           int,
    already_handled_count   int,
    hit_rate                numeric,
    meets_min_sample        boolean
  )
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
  WITH base AS (
    SELECT
      l.signal_type AS sig,
      count(*) AS total,
      count(*) FILTER (WHERE l.dismiss_reason = 'already_handled') AS handled
    FROM cortex.aion_proactive_lines l
    WHERE l.created_at >= now() - (p_window_days || ' days')::interval
    GROUP BY l.signal_type
  )
  SELECT
    b.sig::text,
    b.total::int,
    b.handled::int,
    CASE WHEN b.total > 0 THEN round(b.handled::numeric / b.total, 4) ELSE 0 END,
    b.total >= p_min_sample
  FROM base b
  ORDER BY b.total DESC;
$function$;

COMMENT ON FUNCTION aion.metric_hit_rate(int, int) IS
  'Wk 15a admin metric. Cross-workspace hit_rate per signal_type — already_handled / total. High = signal is catching things the owner already had eyes on. Plan §3.10 card 3.';

-- 3. aion.metric_tool_depth — average + p95 number of tools called per turn.
--    Plan §3.10 card 4: "flag avg >1.5". Reads aion.turn_complete event
--    payload.tools_called array. percentile_cont gives a smoothed p95.
CREATE OR REPLACE FUNCTION aion.metric_tool_depth(
  p_window_days int DEFAULT 7
)
  RETURNS TABLE (
    total_turns           int,
    avg_depth             numeric,
    p95_depth             numeric,
    threshold_exceeded    boolean
  )
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
  WITH depths AS (
    SELECT jsonb_array_length(COALESCE(e.payload->'tools_called', '[]'::jsonb)) AS depth
      FROM ops.aion_events e
     WHERE e.event_type   = 'aion.turn_complete'
       AND e.created_at  >= now() - (p_window_days || ' days')::interval
  )
  SELECT
    count(*)::int                                                 AS total_turns,
    COALESCE(round(avg(d.depth)::numeric, 3), 0)                  AS avg_depth,
    COALESCE(round(percentile_cont(0.95) WITHIN GROUP (ORDER BY d.depth)::numeric, 3), 0) AS p95_depth,
    COALESCE(avg(d.depth) > 1.5, false)                           AS threshold_exceeded
  FROM depths d;
$function$;

COMMENT ON FUNCTION aion.metric_tool_depth(int) IS
  'Wk 15a admin metric. Avg + p95 tools per turn over window. threshold_exceeded flips when avg crosses 1.5 (Plan §3.10 card 4 — heavy tool chains signal misrouted intent or over-eager re-fetches).';

-- 4. aion.metric_pill_click_through — emits vs clicks ratio. Owner clicking
--    the pill headline (Ask Aion) is the conversion signal we care about
--    most; high CTR = pills are landing relevant; low CTR = pills are noise.
CREATE OR REPLACE FUNCTION aion.metric_pill_click_through(
  p_window_days int DEFAULT 7
)
  RETURNS TABLE (
    total_emits         int,
    total_clicks        int,
    click_through_rate  numeric
  )
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
  WITH counts AS (
    SELECT
      count(*) FILTER (WHERE event_type = 'aion.pill_emit')  AS emits,
      count(*) FILTER (WHERE event_type = 'aion.pill_click') AS clicks
      FROM ops.aion_events
     WHERE created_at >= now() - (p_window_days || ' days')::interval
       AND event_type IN ('aion.pill_emit', 'aion.pill_click')
  )
  SELECT
    c.emits::int,
    c.clicks::int,
    CASE WHEN c.emits > 0 THEN round(c.clicks::numeric / c.emits, 4) ELSE 0 END
  FROM counts c;
$function$;

COMMENT ON FUNCTION aion.metric_pill_click_through(int) IS
  'Wk 15a admin metric. Click-through rate on proactive pills — clicks / emits over window. Plan §3.10 card 5. Requires Wk 15a-ii telemetry wiring (pill_emit from cron, pill_click from headline tap).';

-- ── Grants ─────────────────────────────────────────────────────────────────
REVOKE EXECUTE ON FUNCTION aion.metric_dismiss_rate(int, int)        FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION aion.metric_hit_rate(int, int)            FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION aion.metric_tool_depth(int)               FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION aion.metric_pill_click_through(int)       FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION aion.metric_dismiss_rate(int, int)        TO service_role;
GRANT EXECUTE ON FUNCTION aion.metric_hit_rate(int, int)            TO service_role;
GRANT EXECUTE ON FUNCTION aion.metric_tool_depth(int)               TO service_role;
GRANT EXECUTE ON FUNCTION aion.metric_pill_click_through(int)       TO service_role;

-- ── Safety audit ───────────────────────────────────────────────────────────
DO $$
DECLARE
  v_func text;
  v_pub boolean;
  v_anon boolean;
  v_auth boolean;
  v_funcs text[][] := ARRAY[
    ARRAY['metric_dismiss_rate',       'integer, integer'],
    ARRAY['metric_hit_rate',           'integer, integer'],
    ARRAY['metric_tool_depth',         'integer'],
    ARRAY['metric_pill_click_through', 'integer']
  ];
  i int;
BEGIN
  FOR i IN 1..array_length(v_funcs, 1) LOOP
    v_func := format('aion.%s(%s)', v_funcs[i][1], v_funcs[i][2]);
    SELECT has_function_privilege('public', v_func::regprocedure, 'EXECUTE') INTO v_pub;
    SELECT has_function_privilege('anon', v_func::regprocedure, 'EXECUTE') INTO v_anon;
    SELECT has_function_privilege('authenticated', v_func::regprocedure, 'EXECUTE') INTO v_auth;
    IF v_pub OR v_anon OR v_auth THEN
      RAISE EXCEPTION 'Safety audit: non-service_role still holds EXECUTE on % (pub=% anon=% auth=%)',
        v_func, v_pub, v_anon, v_auth;
    END IF;
  END LOOP;
END $$;
