-- Phase 3 §3.10 — upgrade ops.aion_events to monthly range-partitioned table
-- with owner-self-read RLS + session_id + duration_ms.
--
-- Wk 12 shipped a minimal unpartitioned table with no client read access. Wk 13
-- closes the data plane: partitioning from day one (180-day retention via a
-- follow-up cron), session_id + duration_ms columns for tool_call/turn_complete
-- telemetry, and a SELECT policy for owners to see their own workspace's rows
-- (foundation for a future customer-facing telemetry dashboard).
--
-- ops.aion_events has 0 rows in prod (verified 2026-04-26) — drop+recreate
-- is risk-free. Existing brief-open inserts continue to work: the route
-- INSERTs only the columns it knows about (workspace_id, user_id, event_type,
-- payload), and the new session_id + duration_ms are nullable.
--
-- Partition strategy:
--   PRIMARY KEY (id, created_at) — Postgres requires the partition key to be
--     part of the PK on partitioned tables.
--   13 monthly partitions pre-created: 2026-04 through 2027-04.
--   New partitions land via a Wk 14+ cron; manual addition is a one-liner.
--
-- RLS posture:
--   • SELECT — authenticated callers see workspace rows via get_my_workspace_ids().
--   • No INSERT/UPDATE/DELETE policies — writes via service_role only.
--   • anon: REVOKEd from grants entirely.
--
-- Indexes inherit from the parent definition; each partition gets its own
-- physical index covering the same columns.

DROP TABLE IF EXISTS ops.aion_events;

CREATE TABLE ops.aion_events (
  id           uuid NOT NULL DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id   uuid,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  duration_ms  integer,
  created_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (id, created_at)
) PARTITION BY RANGE (created_at);

-- Monthly partitions — 2026-04 through 2027-04 (13 months ahead).
CREATE TABLE ops.aion_events_y2026m04 PARTITION OF ops.aion_events FOR VALUES FROM ('2026-04-01 00:00:00+00') TO ('2026-05-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2026m05 PARTITION OF ops.aion_events FOR VALUES FROM ('2026-05-01 00:00:00+00') TO ('2026-06-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2026m06 PARTITION OF ops.aion_events FOR VALUES FROM ('2026-06-01 00:00:00+00') TO ('2026-07-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2026m07 PARTITION OF ops.aion_events FOR VALUES FROM ('2026-07-01 00:00:00+00') TO ('2026-08-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2026m08 PARTITION OF ops.aion_events FOR VALUES FROM ('2026-08-01 00:00:00+00') TO ('2026-09-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2026m09 PARTITION OF ops.aion_events FOR VALUES FROM ('2026-09-01 00:00:00+00') TO ('2026-10-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2026m10 PARTITION OF ops.aion_events FOR VALUES FROM ('2026-10-01 00:00:00+00') TO ('2026-11-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2026m11 PARTITION OF ops.aion_events FOR VALUES FROM ('2026-11-01 00:00:00+00') TO ('2026-12-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2026m12 PARTITION OF ops.aion_events FOR VALUES FROM ('2026-12-01 00:00:00+00') TO ('2027-01-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2027m01 PARTITION OF ops.aion_events FOR VALUES FROM ('2027-01-01 00:00:00+00') TO ('2027-02-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2027m02 PARTITION OF ops.aion_events FOR VALUES FROM ('2027-02-01 00:00:00+00') TO ('2027-03-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2027m03 PARTITION OF ops.aion_events FOR VALUES FROM ('2027-03-01 00:00:00+00') TO ('2027-04-01 00:00:00+00');
CREATE TABLE ops.aion_events_y2027m04 PARTITION OF ops.aion_events FOR VALUES FROM ('2027-04-01 00:00:00+00') TO ('2027-05-01 00:00:00+00');

-- Indexes on the parent — Postgres propagates them to each partition.
CREATE INDEX aion_events_workspace_type_created_idx
  ON ops.aion_events (workspace_id, event_type, created_at DESC);

CREATE INDEX aion_events_type_created_idx
  ON ops.aion_events (event_type, created_at DESC);

CREATE INDEX aion_events_session_created_idx
  ON ops.aion_events (session_id, created_at DESC)
  WHERE session_id IS NOT NULL;

ALTER TABLE ops.aion_events ENABLE ROW LEVEL SECURITY;

-- Owner-self-read: authenticated callers see only rows for their workspaces.
CREATE POLICY aion_events_owner_select ON ops.aion_events
  FOR SELECT TO authenticated
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

COMMENT ON TABLE ops.aion_events IS
  'Phase 3 §3.10 — append-only Aion telemetry. Monthly range-partitioned on created_at. Authenticated SELECT clamped to caller workspaces via get_my_workspace_ids(); writes via service_role only. session_id + duration_ms feed tool_call/turn_complete/pill_* events from routing-logger.';

REVOKE ALL ON ops.aion_events FROM PUBLIC, anon;
GRANT SELECT          ON ops.aion_events TO authenticated;
GRANT SELECT, INSERT  ON ops.aion_events TO service_role;

-- Safety audit
DO $$
DECLARE
  v_rls       boolean;
  v_anon_sel  boolean;
  v_auth_ins  boolean;
  v_partcount int;
  v_select_pol_exists boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'ops' AND c.relname = 'aion_events';
  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'Safety audit: RLS not enabled on ops.aion_events';
  END IF;

  SELECT has_table_privilege('anon',          'ops.aion_events', 'SELECT') INTO v_anon_sel;
  SELECT has_table_privilege('authenticated', 'ops.aion_events', 'INSERT') INTO v_auth_ins;
  IF v_anon_sel THEN
    RAISE EXCEPTION 'Safety audit: anon still holds SELECT on ops.aion_events';
  END IF;
  IF v_auth_ins THEN
    RAISE EXCEPTION 'Safety audit: authenticated still holds INSERT on ops.aion_events (writes are service-role only)';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM pg_policies WHERE schemaname='ops' AND tablename='aion_events' AND policyname='aion_events_owner_select'
  ) INTO v_select_pol_exists;
  IF NOT v_select_pol_exists THEN
    RAISE EXCEPTION 'Safety audit: aion_events_owner_select policy missing';
  END IF;

  SELECT count(*) INTO v_partcount
    FROM pg_inherits i
    JOIN pg_class p ON p.oid = i.inhparent
    JOIN pg_namespace n ON n.oid = p.relnamespace
   WHERE n.nspname = 'ops' AND p.relname = 'aion_events';
  IF v_partcount < 13 THEN
    RAISE EXCEPTION 'Safety audit: expected 13 monthly partitions, found %', v_partcount;
  END IF;
END $$;
