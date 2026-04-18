-- =============================================================================
-- Multi-date P0 — backfill script
--
-- Run in Supabase SQL Editor AFTER migrations 20260421000000..0400 land. Not
-- a migration so it stays out of the automated apply path. Idempotent.
--
-- Three steps:
--   1. ASSERT the 1:1 deal↔event invariant holds today. Any deal with >1 live
--      event blocks the backfill with a detailed error; those must be resolved
--      manually before continuing.
--   2. Backfill ops.deal_crew.event_id from each row's deal's single event.
--   3. Backfill ops.projects.deal_id from ops.events.deal_id so every existing
--      project inherits its deal link (v3 create_deal_complete assumes every
--      deal has a project from inquiry time; existing deals predate that rule).
--
-- SAFETY: wraps everything in a transaction. Review the counts in the NOTICE
-- output before committing. To dry-run, change COMMIT → ROLLBACK at the bottom.
-- =============================================================================

BEGIN;

-- ─── Step 1: assert 1:1 invariant ──────────────────────────────────────────
DO $block$
DECLARE
  v_violators int;
  v_example record;
BEGIN
  SELECT count(*) INTO v_violators
  FROM (
    SELECT deal_id
    FROM ops.events
    WHERE archived_at IS NULL AND deal_id IS NOT NULL
    GROUP BY deal_id
    HAVING count(*) > 1
  ) s;

  IF v_violators > 0 THEN
    -- Surface one example so the operator knows where to look
    SELECT deal_id, count(*) AS event_count, array_agg(id ORDER BY starts_at) AS event_ids
    INTO v_example
    FROM ops.events
    WHERE archived_at IS NULL AND deal_id IS NOT NULL
    GROUP BY deal_id
    HAVING count(*) > 1
    ORDER BY count(*) DESC
    LIMIT 1;

    RAISE EXCEPTION
      'Backfill blocked: % deals have >1 live event. Example deal=% with % events: %. Resolve manually (archive duplicates or flip the project to is_series=true) before re-running.',
      v_violators, v_example.deal_id, v_example.event_count, v_example.event_ids
      USING ERRCODE = 'P0001';
  END IF;

  RAISE NOTICE 'Step 1 OK: 1:1 deal↔event invariant holds.';
END;
$block$;

-- ─── Step 2: backfill ops.deal_crew.event_id ───────────────────────────────
DO $block$
DECLARE
  v_total int;
  v_pre_null int;
  v_updated int;
  v_post_null int;
BEGIN
  SELECT count(*) INTO v_total FROM ops.deal_crew;
  SELECT count(*) INTO v_pre_null FROM ops.deal_crew WHERE event_id IS NULL;

  WITH source AS (
    SELECT dc.id AS crew_id, e.id AS resolved_event_id
    FROM ops.deal_crew dc
    JOIN ops.events e
      ON e.deal_id = dc.deal_id
      AND e.archived_at IS NULL
    WHERE dc.event_id IS NULL
  )
  UPDATE ops.deal_crew dc
  SET event_id = s.resolved_event_id
  FROM source s
  WHERE dc.id = s.crew_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*) INTO v_post_null FROM ops.deal_crew WHERE event_id IS NULL;

  RAISE NOTICE 'Step 2 deal_crew: total=%, was_null=%, updated=%, still_null=%',
    v_total, v_pre_null, v_updated, v_post_null;

  IF v_post_null > 0 THEN
    RAISE NOTICE 'NOTE: % deal_crew rows still have NULL event_id (deal has no live event). Will be handled at handover or cleaned up manually.', v_post_null;
  END IF;
END;
$block$;

-- ─── Step 3: backfill ops.projects.deal_id ──────────────────────────────────
DO $block$
DECLARE
  v_total int;
  v_pre_null int;
  v_updated int;
  v_post_null int;
BEGIN
  SELECT count(*) INTO v_total FROM ops.projects;
  SELECT count(*) INTO v_pre_null FROM ops.projects WHERE deal_id IS NULL;

  WITH source AS (
    -- Pick the single deal each project is associated with via events. If a
    -- project has events from multiple deals (possible in legacy data), prefer
    -- the deal with the most event rows for that project (min deal_id on tie).
    SELECT DISTINCT ON (e.project_id)
      e.project_id,
      e.deal_id
    FROM ops.events e
    JOIN ops.projects p ON p.id = e.project_id
    WHERE e.project_id IS NOT NULL
      AND e.deal_id IS NOT NULL
      AND p.deal_id IS NULL
    GROUP BY e.project_id, e.deal_id
    ORDER BY e.project_id, count(*) DESC, e.deal_id
  )
  UPDATE ops.projects p
  SET deal_id = s.deal_id
  FROM source s
  WHERE p.id = s.project_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;

  SELECT count(*) INTO v_post_null FROM ops.projects WHERE deal_id IS NULL;

  RAISE NOTICE 'Step 3 projects: total=%, was_null=%, updated=%, still_null=%',
    v_total, v_pre_null, v_updated, v_post_null;
END;
$block$;

-- Flip to ROLLBACK for a dry-run.
COMMIT;
