-- =============================================================================
-- One-shot backfill: delete orphan ops.crew_assignments rows (rescan finding N2)
--
-- Pass 3 Phase 1 shipped the crew confirmation drift trigger
-- (20260411110000_crew_confirmation_drift_trigger.sql). Its migration comment
-- flagged "3 pre-existing orphan drift rows found in dev DB" which the
-- trigger leaves alone on INSERT because it only fires on new writes. Those
-- rows sit as latent landmines: any future status update on them produces
-- a confusing "orphan — please re-add" error for the crew member.
--
-- This migration cleans them up before they can fire.
--
-- Pre-flight against production on 2026-04-11 (via MCP) confirmed exactly 3
-- orphan rows (same count as dev). Analysis of each row:
--
--   Row 1: id=1a1a027c  entity="Daniel Arthur" (claimed user, real person)
--          event=6b45080d "Mr and Mrs Smith Wedding" starts_at=2026-03-21
--          (already happened 3 weeks before this migration), deal=won
--          role=DJ status=confirmed pay_rate=null created=2026-03-11
--          → Pre-dates the Phase 1 mirror pattern. Show is past. Deleting
--            loses zero user-facing value.
--
--   Row 2: id=7ad0a9d8  entity="Marcus Test DJ" (ghost, test data)
--          event=b068545c "Madison's Wedding" starts_at=2026-10-01 (future),
--          deal=won, role=DJ status=confirmed pay_rate=$75/hr
--          → Test data (name contains "Test"). Show is future so the drift
--            trigger would eventually bite if someone tries to re-confirm.
--            Clean up now.
--
--   Row 3: id=6ed7f06a  entity="Marcus Test DJ" (ghost, test data)
--          event=6b45080d "Mr and Mrs Smith Wedding" (same past event as Row 1)
--          role=DJ status=confirmed pay_rate=$75/hr created=2026-04-09
--          → Test data, past show. Clean up.
--
-- Foreign key check (via MCP): only inbound FK is
-- ops.crew_confirmation_tokens.assignment_id with ON DELETE SET NULL. No
-- tokens attached to any of the 3 orphan rows (verified 2026-04-11). Delete
-- is clean.
--
-- Writer-side invariant going forward: the drift trigger
-- (ops.crew_assignments_confirmation_drift) rejects any INSERT/UPDATE of
-- status='confirmed' that lacks a partner deal_crew row. This migration
-- cleans existing drift; the trigger prevents future drift.
-- =============================================================================

DELETE FROM ops.crew_assignments
WHERE id IN (
  '1a1a027c-d94c-4665-bf37-7dd6c9f2e987',
  '7ad0a9d8-5f27-4447-985a-9a0178465c66',
  '6ed7f06a-48bb-4254-bcb3-050e7caa98a5'
);

-- Post-condition verification: no remaining orphans after this migration.
-- Wrapped in a DO block so the migration FAILS LOUDLY if the cleanup missed
-- anything (e.g. new orphans inserted between pre-flight and migration run).
DO $$
DECLARE
  v_orphan_count int;
BEGIN
  SELECT COUNT(*)
    INTO v_orphan_count
  FROM ops.crew_assignments ca
  JOIN ops.events e ON e.id = ca.event_id
  WHERE ca.entity_id IS NOT NULL
    AND NOT EXISTS (
      SELECT 1
      FROM ops.deal_crew dc
      WHERE dc.deal_id = e.deal_id
        AND dc.entity_id = ca.entity_id
    );

  IF v_orphan_count > 0 THEN
    RAISE EXCEPTION
      'Post-backfill check failed: % orphan crew_assignments rows still exist. Investigate before retrying.',
      v_orphan_count;
  END IF;
END;
$$;
