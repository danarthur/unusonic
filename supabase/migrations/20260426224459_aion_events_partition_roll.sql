-- Phase 3 §3.10 Wk 15c — partition-lifecycle helper for ops.aion_events.
-- Creates the next 13 monthly partitions (current + 12 ahead) if missing,
-- and drops partitions whose range_end fell more than 180 days ago.
--
-- Idempotent: re-running on the same day is a no-op once the next month's
-- partition is already created. Safe to schedule daily; the cost is a
-- handful of fast catalog lookups + maybe one CREATE TABLE on the 1st of
-- each month.
--
-- The 180-day retention matches plan §3.10 C10. Older telemetry rows are
-- archived (or just discarded) by partition-drop rather than DELETE — much
-- cheaper at scale, and keeps the active partitions hot in cache.
--
-- Service-role only by GRANT. The cron route at
-- /api/cron/aion-events-partition-lifecycle calls this RPC after the
-- CRON_SECRET bearer check.
--
-- Partition naming convention: aion_events_y{YYYY}m{MM} (matches the
-- 13 partitions seeded in 20260426210442_aion_events_partition_upgrade).

CREATE OR REPLACE FUNCTION aion.roll_aion_events_partitions()
  RETURNS TABLE (
    action          text,
    partition_name  text,
    range_start     date,
    range_end       date
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
DECLARE
  v_target_date    date;
  v_partition_name text;
  v_range_start    date;
  v_range_end      date;
  v_drop_cutoff    date := (now() - interval '180 days')::date;
  v_existing       record;
  v_year           int;
  v_month          int;
  v_partition_end  date;
  i                int;
BEGIN
  -- Phase 1: create missing partitions for current + 12 months ahead.
  FOR i IN 0..12 LOOP
    v_target_date := (date_trunc('month', now())::date + (i || ' months')::interval)::date;
    v_range_start := v_target_date;
    v_range_end   := (v_target_date + interval '1 month')::date;
    v_partition_name := 'aion_events_' || to_char(v_target_date, '"y"YYYY"m"MM');

    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'ops' AND c.relname = v_partition_name
    ) THEN
      EXECUTE format(
        'CREATE TABLE ops.%I PARTITION OF ops.aion_events FOR VALUES FROM (%L) TO (%L)',
        v_partition_name,
        v_range_start::text || ' 00:00:00+00',
        v_range_end::text   || ' 00:00:00+00'
      );
      action         := 'created';
      partition_name := v_partition_name;
      range_start    := v_range_start;
      range_end      := v_range_end;
      RETURN NEXT;
    END IF;
  END LOOP;

  -- Phase 2: drop partitions whose range_end is before the 180-day cutoff.
  FOR v_existing IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_inherits inh ON inh.inhrelid = c.oid
    JOIN pg_class p     ON p.oid = inh.inhparent
    JOIN pg_namespace pn ON pn.oid = p.relnamespace
    WHERE pn.nspname = 'ops'
      AND p.relname  = 'aion_events'
      AND n.nspname  = 'ops'
      AND c.relname ~ '^aion_events_y\d{4}m\d{2}$'
  LOOP
    v_year  := substring(v_existing.relname from 'y(\d{4})m')::int;
    v_month := substring(v_existing.relname from 'm(\d{2})$')::int;
    v_partition_end := (make_date(v_year, v_month, 1) + interval '1 month')::date;

    IF v_partition_end < v_drop_cutoff THEN
      EXECUTE format('DROP TABLE ops.%I', v_existing.relname);
      action         := 'dropped';
      partition_name := v_existing.relname;
      range_start    := make_date(v_year, v_month, 1);
      range_end      := v_partition_end;
      RETURN NEXT;
    END IF;
  END LOOP;

  RETURN;
END;
$function$;

COMMENT ON FUNCTION aion.roll_aion_events_partitions() IS
  'Wk 15c partition-lifecycle helper. Creates missing aion_events_y{YYYY}m{MM} partitions for current+12 months, drops partitions whose range_end is more than 180 days in the past. Idempotent. Called daily from /api/cron/aion-events-partition-lifecycle.';

REVOKE EXECUTE ON FUNCTION aion.roll_aion_events_partitions() FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION aion.roll_aion_events_partitions() TO service_role;

DO $$
DECLARE v_pub boolean; v_anon boolean; v_auth boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'aion.roll_aion_events_partitions()'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'aion.roll_aion_events_partitions()'::regprocedure;
  SELECT has_function_privilege('authenticated', oid, 'EXECUTE') INTO v_auth
    FROM pg_proc WHERE oid = 'aion.roll_aion_events_partitions()'::regprocedure;
  IF v_pub OR v_anon OR v_auth THEN
    RAISE EXCEPTION 'Safety audit: non-service_role still holds EXECUTE on aion.roll_aion_events_partitions';
  END IF;
END $$;
