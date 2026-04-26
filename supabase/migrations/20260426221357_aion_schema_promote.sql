-- Phase 3 §3.10 — promote Aion admin/observability functions to a dedicated
-- `aion` schema. Wk 13 shipped `cortex.metric_brief_open_kill_check`; this
-- groundwork commit moves it to `aion.*` and establishes the new schema as
-- the canonical home for every admin / observability function going forward.
--
-- Why a separate schema: cortex.* houses the data substrate (sessions,
-- messages, proactive lines, mutes, insights, relationships, memory) and is
-- workspace-scoped. The admin telemetry functions are CROSS-workspace by
-- design — they exist to give Daniel/internal admins a view of the whole
-- system. Mixing them in the same namespace as user-facing functions makes
-- the boundary fuzzy and the grants harder to reason about. A dedicated
-- `aion.*` namespace = "Aion's own internals" — reads on which RPCs are
-- admin-only become trivially auditable.
--
-- This is the cheapest moment to make the move: only one function exists.
-- Doing it later when there are 5+ admin metric RPCs would mean the same
-- migration spread across more functions.

-- ── Schema + grants ────────────────────────────────────────────────────────

CREATE SCHEMA IF NOT EXISTS aion;

COMMENT ON SCHEMA aion IS
  'Phase 3 §3.10 — Aion admin/observability/telemetry namespace. Cross-workspace by design (admin queries aggregate over all workspaces). Distinct from cortex.* which houses the per-workspace data substrate (sessions, messages, proactive lines, memory). Every function here gets REVOKEd from PUBLIC/anon/authenticated by default and GRANTed only to service_role; admin route handlers gate via isAionAdmin() before invoking.';

REVOKE ALL ON SCHEMA aion FROM PUBLIC;
GRANT  USAGE ON SCHEMA aion TO authenticated, service_role;

-- ── Move metric_brief_open_kill_check from cortex to aion ──────────────────

DROP FUNCTION IF EXISTS cortex.metric_brief_open_kill_check(integer, integer, integer);

CREATE OR REPLACE FUNCTION aion.metric_brief_open_kill_check(
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
    count(*)::int             AS total_opens,
    max(w.rolling_count)::int AS max_in_window,
    min(w.created_at)         AS first_open,
    max(w.created_at)         AS last_open
  FROM windowed w
  GROUP BY w.workspace_id, w.user_id
  HAVING max(w.rolling_count) >= p_min_repeats
  ORDER BY max(w.rolling_count) DESC, count(*) DESC;
$function$;

COMMENT ON FUNCTION aion.metric_brief_open_kill_check(integer, integer, integer) IS
  'Phase 3 §3.10 — repeat-user stats for the §3.9 brief-open kill metric. Returns one row per (workspace, user) hitting >= p_min_repeats opens within any sliding p_repeat_window_days slice over the last p_window_days. Service-role only — admin route gates via isAionAdmin(). Moved from cortex.* to aion.* in Wk 15-pre.';

REVOKE EXECUTE ON FUNCTION aion.metric_brief_open_kill_check(integer, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION aion.metric_brief_open_kill_check(integer, integer, integer) TO service_role;

-- ── Safety audit ───────────────────────────────────────────────────────────

DO $$
DECLARE
  v_pub boolean; v_anon boolean; v_auth boolean;
  v_old_exists boolean;
  v_schema_exists boolean;
BEGIN
  -- New aion schema exists.
  SELECT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname = 'aion') INTO v_schema_exists;
  IF NOT v_schema_exists THEN
    RAISE EXCEPTION 'Safety audit: aion schema not created';
  END IF;

  -- New function exists with locked-down grants.
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'aion.metric_brief_open_kill_check(integer, integer, integer)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'aion.metric_brief_open_kill_check(integer, integer, integer)'::regprocedure;
  SELECT has_function_privilege('authenticated', oid, 'EXECUTE') INTO v_auth
    FROM pg_proc WHERE oid = 'aion.metric_brief_open_kill_check(integer, integer, integer)'::regprocedure;
  IF v_pub OR v_anon OR v_auth THEN
    RAISE EXCEPTION 'Safety audit: non-service_role still holds EXECUTE on aion.metric_brief_open_kill_check (pub=% anon=% auth=%)',
      v_pub, v_anon, v_auth;
  END IF;

  -- Old function removed.
  SELECT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'cortex' AND p.proname = 'metric_brief_open_kill_check'
  ) INTO v_old_exists;
  IF v_old_exists THEN
    RAISE EXCEPTION 'Safety audit: cortex.metric_brief_open_kill_check still exists — schema migration incomplete';
  END IF;
END $$;
