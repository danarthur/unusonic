-- Phase 3 §3.10 lite — minimal ops.aion_events table for Wk 12 telemetry
-- so the §3.9 brief-open kill-if-usage 90-day measurement window starts NOW
-- against persisted data instead of console logs.
--
-- Plan §3.10's full admin-telemetry vision (monthly partitioning C10, admin
-- env perimeter C9, query routes) lands later. Wk 12 just needs a place to
-- write event-type rows so they can be aggregated when §3.10 ships.
--
-- Schema:
--   id            uuid PK (gen_random_uuid)
--   workspace_id  uuid (nullable for cross-workspace events)
--   user_id       uuid FK auth.users — nullable for system events
--   event_type    text NOT NULL — telemetry namespace key (e.g. 'aion.brief_open')
--   payload       jsonb DEFAULT '{}' — event-specific shape
--   created_at    timestamptz NOT NULL DEFAULT now()
--
-- RLS: enabled, no client policies. Writes via getSystemClient only — this
-- table is admin-only and exposing it through PostgREST would leak telemetry
-- across workspaces. Reads in §3.10 happen through SECURITY DEFINER RPCs
-- gated by the AION_ADMIN_USER_IDS env perimeter.

CREATE TABLE ops.aion_events (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id      uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  event_type   text NOT NULL,
  payload      jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at   timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX aion_events_workspace_type_created_idx
  ON ops.aion_events (workspace_id, event_type, created_at DESC);

CREATE INDEX aion_events_type_created_idx
  ON ops.aion_events (event_type, created_at DESC);

ALTER TABLE ops.aion_events ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE ops.aion_events IS
  'Phase 3 §3.10 lite — append-only Aion telemetry. Wk 12: brief-open events. RLS on, no client policies; service_role writes only. §3.10 will add monthly partitioning + admin SECURITY DEFINER read RPCs.';

REVOKE ALL ON ops.aion_events FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON ops.aion_events TO service_role;

DO $$
DECLARE
  v_rls       boolean;
  v_auth_sel  boolean;
  v_auth_ins  boolean;
  v_anon_sel  boolean;
BEGIN
  SELECT relrowsecurity INTO v_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'ops' AND c.relname = 'aion_events';
  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'Safety audit: RLS not enabled on ops.aion_events';
  END IF;

  SELECT has_table_privilege('authenticated', 'ops.aion_events', 'SELECT') INTO v_auth_sel;
  SELECT has_table_privilege('authenticated', 'ops.aion_events', 'INSERT') INTO v_auth_ins;
  SELECT has_table_privilege('anon',          'ops.aion_events', 'SELECT') INTO v_anon_sel;
  IF v_auth_sel OR v_auth_ins OR v_anon_sel THEN
    RAISE EXCEPTION 'Safety audit: non-service_role still holds privileges on ops.aion_events (auth_sel=% auth_ins=% anon_sel=%)',
      v_auth_sel, v_auth_ins, v_anon_sel;
  END IF;
END $$;
