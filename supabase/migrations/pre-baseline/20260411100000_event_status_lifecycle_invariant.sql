-- Pass 3 Phase 0 — lifecycle_status / status drift invariant.
--
-- Pass 1.5B introduced write-time duplication in mark-show-state.ts and
-- delete-event.ts. This migration moves the invariant from "trust every
-- writer remembers to update both columns" to "the database rejects any
-- write that would diverge them".
--
-- Mapping:
--   status='planned'      -> lifecycle_status in (NULL, lead, tentative, confirmed, production)
--   status='in_progress'  -> lifecycle_status = 'live'
--   status='completed'    -> lifecycle_status = 'post'
--   status='cancelled'    -> lifecycle_status = 'cancelled'
--   status='archived'     -> lifecycle_status = 'archived'
--
-- The TypeScript mirror of this function lives at
-- src/shared/lib/event-status/pair-valid.ts and is covered by
-- src/shared/lib/event-status/__tests__/pair-valid.test.ts so drift
-- between the SQL and TS versions surfaces as a test failure.
--
-- Pre-flight (2026-04-11): 4 total events, 0 drift rows, 0 null status,
-- 0 unknown lifecycle values. Safe to apply without backfill.

CREATE OR REPLACE FUNCTION ops.event_status_pair_valid(
  p_status text,
  p_lifecycle text
) RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_status IS NULL THEN false
    WHEN p_status = 'planned' THEN
      p_lifecycle IS NULL
        OR p_lifecycle IN ('lead','tentative','confirmed','production')
    WHEN p_status = 'in_progress' THEN p_lifecycle = 'live'
    WHEN p_status = 'completed'   THEN p_lifecycle = 'post'
    WHEN p_status = 'cancelled'   THEN p_lifecycle = 'cancelled'
    WHEN p_status = 'archived'    THEN p_lifecycle = 'archived'
    ELSE false
  END;
$$;

REVOKE ALL ON FUNCTION ops.event_status_pair_valid(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.event_status_pair_valid(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION ops.event_status_pair_valid(text, text) TO authenticated, service_role;

COMMENT ON FUNCTION ops.event_status_pair_valid(text, text) IS
  'Pass 3 Phase 0: pure mapping function used by the events_status_pair_check trigger to reject status/lifecycle_status drift. Canonical writers: mark-show-state.ts (start/end/undo) and delete-event.ts (cancel). TS mirror at src/shared/lib/event-status/pair-valid.ts.';

CREATE OR REPLACE FUNCTION ops.events_status_pair_check_trg()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NOT ops.event_status_pair_valid(NEW.status, NEW.lifecycle_status) THEN
    RAISE EXCEPTION
      'ops.events status/lifecycle_status drift: status=% lifecycle_status=%',
      NEW.status, NEW.lifecycle_status
      USING ERRCODE = 'check_violation';
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION ops.events_status_pair_check_trg() FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.events_status_pair_check_trg() FROM anon;

DROP TRIGGER IF EXISTS events_status_pair_check ON ops.events;

CREATE TRIGGER events_status_pair_check
BEFORE INSERT OR UPDATE OF status, lifecycle_status ON ops.events
FOR EACH ROW
EXECUTE FUNCTION ops.events_status_pair_check_trg();

COMMENT ON TRIGGER events_status_pair_check ON ops.events IS
  'Pass 3 Phase 0: rejects writes that would put status and lifecycle_status into incompatible values. Pass 1.5B kept these in sync at the application layer; this trigger makes the invariant load-bearing.';
