-- Phase 2.1 Sprint 5 — adjacent-event + soft-load helpers.
--
-- Adjacent events: confirmed shows whose local date falls in [date-36h, date+36h]
-- but is NOT the same as p_date. The Visionary's "wedding doubleheader" case:
-- load-in Friday 6pm, show Saturday, strike Sunday 1am. When the user picks
-- Saturday, the popover should surface the Friday load-out and the Sunday
-- strike as adjacent context. 36h window catches load-in and strike-out
-- without fetching the entire week.
--
-- Soft load: aggregate count of confirmed shows + open deals in the same
-- window. Drives the "Heavy weekend — 3 confirmed in 72h" sub-line in the
-- popover. Per User Advocate vocabulary: count, never percentage; show
-- count + crew load, never revenue.
--
-- Per Phase 2 design doc §3.9: this is the deterministic adjacent-day check
-- that handles the 90% case of multi-day-adjacent reality without a schema
-- change. True multi-day deal date ranges are deferred to a separate
-- initiative.

-- ─────────────────────────────────────────────────────────────────────────
-- Adjacent events helper
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops._feasibility_adjacent_events(
  p_workspace_id uuid,
  p_date         date
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',         e.id,
        'title',      COALESCE(e.title, 'Untitled show'),
        'starts_at',  e.starts_at,
        'ends_at',    e.ends_at,
        'venue_id',   e.venue_entity_id,
        'local_date', (e.starts_at AT TIME ZONE COALESCE(e.timezone, 'UTC'))::date,
        'side',       CASE
                        WHEN (e.starts_at AT TIME ZONE COALESCE(e.timezone, 'UTC'))::date < p_date THEN 'before'
                        WHEN (e.starts_at AT TIME ZONE COALESCE(e.timezone, 'UTC'))::date > p_date THEN 'after'
                        ELSE 'overlap'
                      END
      )
      ORDER BY e.starts_at
    ),
    '[]'::jsonb
  )
  FROM ops.events e
  WHERE e.workspace_id = p_workspace_id
    AND e.archived_at IS NULL
    AND e.lifecycle_status IS DISTINCT FROM 'cancelled'
    AND e.lifecycle_status IS DISTINCT FROM 'archived'
    -- 36-hour window on each side, in workspace-local time.
    AND e.starts_at <= ((p_date + 1)::timestamptz + interval '36 hours')
    AND COALESCE(e.ends_at, e.starts_at) >= ((p_date)::timestamptz - interval '36 hours')
    -- Exclude same-date overlaps (those are surfaced by the existing
    -- _feasibility_confirmed_shows helper as primary conflicts).
    AND (e.starts_at AT TIME ZONE COALESCE(e.timezone, 'UTC'))::date <> p_date;
$function$;

COMMENT ON FUNCTION ops._feasibility_adjacent_events(uuid, date) IS
  'Phase 2.1 Sprint 5 — confirmed events within ±36h of p_date but NOT on the same local date. Drives the Adjacent section of the popover and the Travel sub-section of the Conflicts panel.';

REVOKE EXECUTE ON FUNCTION ops._feasibility_adjacent_events(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops._feasibility_adjacent_events(uuid, date) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Soft-load helper
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops._feasibility_soft_load(
  p_workspace_id uuid,
  p_date         date
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
  WITH
  -- Confirmed shows in the 72h window (36h on each side).
  events_in_window AS (
    SELECT count(*) AS c
    FROM ops.events e
    WHERE e.workspace_id = p_workspace_id
      AND e.archived_at IS NULL
      AND e.lifecycle_status IS DISTINCT FROM 'cancelled'
      AND e.lifecycle_status IS DISTINCT FROM 'archived'
      AND e.starts_at <= ((p_date + 1)::timestamptz + interval '36 hours')
      AND COALESCE(e.ends_at, e.starts_at) >= ((p_date)::timestamptz - interval '36 hours')
  ),
  -- Open deals in the 72h window — non-terminal, non-archived, dated.
  -- Mirror Phase 1's tag set + Sprint 1's contract_out/signed/etc.
  tentative_stages AS (
    SELECT s.id
    FROM ops.pipelines       p
    JOIN ops.pipeline_stages s ON s.pipeline_id = p.id
    WHERE p.workspace_id = p_workspace_id
      AND p.is_default
      AND NOT p.is_archived
      AND NOT s.is_archived
      AND (s.tags && ARRAY[
        'initial_contact', 'proposal_sent',
        'contract_out', 'contract_signed', 'deposit_received', 'ready_for_handoff'
      ]::text[])
  ),
  deals_in_window AS (
    SELECT count(*) AS c
    FROM public.deals d
    WHERE d.workspace_id  = p_workspace_id
      AND d.archived_at   IS NULL
      AND d.event_id      IS NULL
      AND d.proposed_date BETWEEN (p_date - 1) AND (p_date + 1)
      AND d.stage_id IN (SELECT id FROM tentative_stages)
  )
  SELECT jsonb_build_object(
    'confirmed_in_72h', (SELECT c FROM events_in_window),
    'deals_in_72h',     (SELECT c FROM deals_in_window),
    'is_heavy',         ((SELECT c FROM events_in_window) + (SELECT c FROM deals_in_window)) >= 3
  );
$function$;

COMMENT ON FUNCTION ops._feasibility_soft_load(uuid, date) IS
  'Phase 2.1 Sprint 5 — soft-load aggregate (confirmed shows + open deals) in the 72h window centered on p_date. is_heavy = total ≥ 3, drives the popover sub-line. Count-based, never percentage (per User Advocate vocabulary).';

REVOKE EXECUTE ON FUNCTION ops._feasibility_soft_load(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops._feasibility_soft_load(uuid, date) TO service_role;

-- Audit
DO $$
DECLARE
  v_adj_path  boolean;
  v_load_path boolean;
BEGIN
  SELECT proconfig IS NOT NULL INTO v_adj_path
    FROM pg_proc WHERE oid = 'ops._feasibility_adjacent_events(uuid, date)'::regprocedure;
  SELECT proconfig IS NOT NULL INTO v_load_path
    FROM pg_proc WHERE oid = 'ops._feasibility_soft_load(uuid, date)'::regprocedure;
  IF NOT v_adj_path THEN
    RAISE EXCEPTION 'Safety audit: ops._feasibility_adjacent_events has mutable search_path';
  END IF;
  IF NOT v_load_path THEN
    RAISE EXCEPTION 'Safety audit: ops._feasibility_soft_load has mutable search_path';
  END IF;
END $$;
