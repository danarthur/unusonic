-- Pass 3 Phase 1 — crew confirmation drift trigger.
--
-- Enforces the invariant that crew_assignments.status='confirmed' must be
-- accompanied by a matching deal_crew.confirmed_at (looked up via the
-- event->deal chain + entity_id). Pass 1.5B used write-time sync; this
-- trigger makes drift physically impossible on new writes.
--
-- Writer-side: src/features/ops/actions/respond-to-crew-assignment.ts
--   must mirror the deal_crew confirmed_at timestamp BEFORE updating
--   crew_assignments.status. If the partner deal_crew row does not exist
--   (orphan assignment), the trigger rejects the write and the application
--   surfaces an "orphan — please re-add" error to the user.
--
-- Pre-flight (2026-04-11): 3 pre-existing orphan drift rows found in
-- dev DB. These sit untouched — the trigger only fires on INSERT or
-- UPDATE OF status. Pre-existing rows at status='confirmed' are not
-- re-set, so they pass. The trigger SHOULD block any future re-confirm
-- attempt on those orphans, and that is correct enforcement behavior.
--
-- Escape hatch for syncCrewRatesToAssignments at handoff: the sync reads
-- deal_crew first and writes crew_assignments second, so the lookup
-- succeeds naturally. No session variable needed today. If a future
-- bulk-import path needs to bypass, the pattern is:
--   SET LOCAL app.crew_sync_in_progress = '1';
--   -- then inspect current_setting('app.crew_sync_in_progress', true)
--   -- inside the trigger and skip the check. Not wired in this migration.

CREATE OR REPLACE FUNCTION ops.crew_confirmation_drift_check_trg()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ops, public
AS $$
DECLARE
  v_dc_confirmed timestamptz;
  v_dc_exists boolean;
BEGIN
  IF (TG_OP = 'UPDATE' OR TG_OP = 'INSERT')
     AND NEW.status = 'confirmed'
     AND NEW.entity_id IS NOT NULL
     AND NEW.event_id IS NOT NULL THEN

    SELECT dc.confirmed_at, true
      INTO v_dc_confirmed, v_dc_exists
    FROM ops.deal_crew dc
    JOIN ops.events e ON e.deal_id = dc.deal_id
    WHERE e.id = NEW.event_id
      AND dc.entity_id = NEW.entity_id
    LIMIT 1;

    IF v_dc_exists IS NOT TRUE THEN
      RAISE EXCEPTION
        'crew_assignments.status=confirmed rejected: no matching deal_crew row for event_id=% entity_id=%. The partner row must be created via the Production Team Card before the portal can confirm.',
        NEW.event_id, NEW.entity_id
        USING ERRCODE = 'check_violation',
              HINT = 'Use respondToCrewAssignment() which mirrors deal_crew.confirmed_at first.';
    END IF;

    IF v_dc_confirmed IS NULL THEN
      RAISE EXCEPTION
        'crew_assignments.status=confirmed rejected: partner deal_crew.confirmed_at is NULL for event_id=% entity_id=%. Writer must mirror both rows.',
        NEW.event_id, NEW.entity_id
        USING ERRCODE = 'check_violation',
              HINT = 'Use respondToCrewAssignment() in src/features/ops/actions/respond-to-crew-assignment.ts which mirrors both tables.';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION ops.crew_confirmation_drift_check_trg() FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.crew_confirmation_drift_check_trg() FROM anon;

DROP TRIGGER IF EXISTS crew_assignments_confirmation_drift ON ops.crew_assignments;

CREATE TRIGGER crew_assignments_confirmation_drift
BEFORE INSERT OR UPDATE OF status ON ops.crew_assignments
FOR EACH ROW
EXECUTE FUNCTION ops.crew_confirmation_drift_check_trg();

COMMENT ON TRIGGER crew_assignments_confirmation_drift ON ops.crew_assignments IS
  'Pass 3 Phase 1: rejects status=confirmed writes when the partner deal_crew row is missing or has NULL confirmed_at. See src/features/ops/actions/respond-to-crew-assignment.ts for the canonical mirror pattern. 3 pre-existing orphan rows at migration time are untouched; trigger only fires on new status writes.';
