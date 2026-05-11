-- ────────────────────────────────────────────────────────────────────────────
-- Backfill ops.events context columns + workspaces.timezone for the pilot.
-- Audit: docs/audits/handover-pipeline-data-bug-investigation-2026-05-07.md
-- Guardian review (PR #1):
--   docs/audits/handover-pipeline-pr1-guardian-2026-05-07.md
--
-- Two roots:
--   - workspaces.timezone defaults to 'UTC'. Every workspace bootstrapped before
--     the workspace-creation tz fix shipped (PR #2 code change) carries 'UTC'.
--     For the pilot (Invisible Touch Events, LA-based), 'UTC' is wrong.
--   - ops.events legacy handovers (prism.tsx banner button → handoverDeal(dealId)
--     with no wizard payload) left venue_entity_id, client_entity_id,
--     location_name, location_address NULL and timezone='UTC' because the
--     legacy `else` branch never resolved stakeholders. PR #1 closed the write
--     path; this backfill catches the rows already written.
--
-- Idempotency: every UPDATE filters on NULL / 'UTC' sentinels and uses COALESCE
-- to preserve already-set values. Re-running the migration is a no-op.
--
-- ─── Rollback ──────────────────────────────────────────────────────────────
-- We do NOT ship a down migration. If a row is mismapped (wrong stakeholder
-- ordering, etc.) the owner re-saves on the event detail page; the
-- defense-in-depth fallback chains in reader code (get-event-summary.ts,
-- build-event-scope-prefix.ts) keep working until the column is corrected.
--
-- Emergency rollback to pre-migration state, if absolutely needed:
--   UPDATE workspaces
--   SET timezone = 'UTC'
--   WHERE id IN ('<workspace_id>') -- filter to specific workspaces only
--     AND timezone = 'America/Los_Angeles';
--
--   UPDATE ops.events
--   SET timezone = 'UTC'
--   WHERE id IN ('<event_id>', ...);
--
--   UPDATE ops.events
--   SET venue_entity_id  = NULL,
--       client_entity_id = NULL,
--       location_name    = NULL,
--       location_address = NULL
--   WHERE id IN ('<event_id>', ...);
-- ────────────────────────────────────────────────────────────────────────────

BEGIN;

-- ─── 1. workspaces.timezone: 'UTC' → 'America/Los_Angeles' ──────────────────
-- One-off blanket update for the pilot. Today only Invisible Touch Events is
-- in production (LA-based). The bootstrap fix in src/app/actions/workspace.ts
-- + src/features/onboarding/actions/complete-setup.ts handles new workspaces
-- going forward by writing the browser-reported IANA tz at create time.
UPDATE public.workspaces
SET timezone = 'America/Los_Angeles'
WHERE timezone = 'UTC';


-- ─── 2. ops.events.venue_entity_id from venue_contact stakeholder ──────────
-- COALESCE(organization_id, entity_id) mirrors handoff-wizard.tsx:90 and
-- get-event-summary.ts:148 — venues are the org-side of the dual-node pattern
-- (organization_id is the venue org/entity; entity_id is typically NULL but
-- present for venues entered as people). Prefer is_primary=true when multiple
-- venue_contact rows exist; ORDER BY ... DESC LIMIT 1 picks the canonical row.
WITH ranked AS (
  SELECT DISTINCT ON (s.deal_id)
    s.deal_id,
    COALESCE(s.organization_id, s.entity_id) AS venue_entity_id
  FROM ops.deal_stakeholders s
  WHERE s.role = 'venue_contact'
    AND COALESCE(s.organization_id, s.entity_id) IS NOT NULL
  ORDER BY s.deal_id, s.is_primary DESC, s.added_at ASC
)
UPDATE ops.events e
SET venue_entity_id = ranked.venue_entity_id
FROM ranked
WHERE e.venue_entity_id IS NULL
  AND e.deal_id = ranked.deal_id;


-- ─── 3. ops.events.client_entity_id from bill_to stakeholder ────────────────
-- COALESCE(entity_id, organization_id) — billing contacts are entity-side
-- (the person who signed in via the client portal). Matches
-- handoff-wizard.tsx:89 and get-event-summary.ts:144 exactly. Same primary-row
-- preference as venue resolution above.
WITH ranked AS (
  SELECT DISTINCT ON (s.deal_id)
    s.deal_id,
    COALESCE(s.entity_id, s.organization_id) AS client_entity_id
  FROM ops.deal_stakeholders s
  WHERE s.role = 'bill_to'
    AND COALESCE(s.entity_id, s.organization_id) IS NOT NULL
  ORDER BY s.deal_id, s.is_primary DESC, s.added_at ASC
)
UPDATE ops.events e
SET client_entity_id = ranked.client_entity_id
FROM ranked
WHERE e.client_entity_id IS NULL
  AND e.deal_id = ranked.deal_id;


-- ─── 4. ops.events.location_name from venue entity display_name ─────────────
-- Denormalizes the venue's name onto the event row so detail surfaces keep
-- working if the venue is later soft-deleted or renamed. Matches the wizard
-- path in handover-deal.ts:282.
UPDATE ops.events e
SET location_name = de.display_name
FROM directory.entities de
WHERE e.location_name IS NULL
  AND e.venue_entity_id IS NOT NULL
  AND de.id = e.venue_entity_id
  AND de.display_name IS NOT NULL;


-- ─── 5. ops.events.location_address from venue entity attributes ────────────
-- Prefer attributes.formatted_address (written by Google Places autocomplete),
-- fall through to a composed [street, city, state, postal_code] join. Matches
-- update-event-venue.ts:37-40 and the new handover-deal.ts:284-287 format.
-- The `address` sub-object exists in some legacy entities; the canonical
-- attribute keys are top-level (street/city/state/postal_code) per
-- src/entities/directory/model/venue-attrs.ts. We try both shapes so both
-- generations of venue entity get covered.
UPDATE ops.events e
SET location_address = composed.addr
FROM directory.entities de
CROSS JOIN LATERAL (
  SELECT COALESCE(
    NULLIF(de.attributes->>'formatted_address', ''),
    NULLIF(
      array_to_string(
        ARRAY(
          SELECT v FROM unnest(ARRAY[
            NULLIF(de.attributes->>'street', ''),
            NULLIF(de.attributes->>'city', ''),
            NULLIF(de.attributes->>'state', ''),
            NULLIF(de.attributes->>'postal_code', '')
          ]) AS v WHERE v IS NOT NULL AND v <> ''
        ),
        ', '
      ),
      ''
    ),
    NULLIF(
      array_to_string(
        ARRAY(
          SELECT v FROM unnest(ARRAY[
            NULLIF(de.attributes->'address'->>'street', ''),
            NULLIF(de.attributes->'address'->>'city', ''),
            NULLIF(de.attributes->'address'->>'state', ''),
            NULLIF(de.attributes->'address'->>'postal_code', '')
          ]) AS v WHERE v IS NOT NULL AND v <> ''
        ),
        ', '
      ),
      ''
    )
  ) AS addr
) AS composed
WHERE e.location_address IS NULL
  AND e.venue_entity_id IS NOT NULL
  AND de.id = e.venue_entity_id
  AND composed.addr IS NOT NULL;


-- ─── 6. ops.events.timezone — three-step resolution chain ───────────────────
-- Matches the resolveEventTimezone server chain in src/shared/lib/timezone.ts
-- and the Aion brief chain in src/app/api/aion/lib/build-event-scope-prefix.ts:
--   6a. venue.attributes.timezone (skip 'UTC' sentinel)
--   6b. workspace.timezone (already backfilled in step 1, but skip 'UTC'
--       defensively in case step 1's predicate left a row behind)
--   6c. SAFE_FALLBACK_TZ = 'America/Los_Angeles'
--
-- Treat 'UTC' as a sentinel at every step — the column default forces SOME
-- value, so 'UTC' almost certainly means "nobody set it" rather than "this
-- event genuinely runs on UTC wall clock".

-- 6a. From venue entity attributes.timezone
UPDATE ops.events e
SET timezone = de.attributes->>'timezone'
FROM directory.entities de
WHERE e.timezone = 'UTC'
  AND e.venue_entity_id IS NOT NULL
  AND de.id = e.venue_entity_id
  AND de.attributes ? 'timezone'
  AND NULLIF(de.attributes->>'timezone', '') IS NOT NULL
  AND de.attributes->>'timezone' <> 'UTC'
  -- Defense: only accept tz strings that satisfy the events_timezone_iana CHECK,
  -- so a malformed venue attribute can never break the migration.
  AND de.attributes->>'timezone' ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$';

-- 6b. From workspaces.timezone (now LA after step 1)
UPDATE ops.events e
SET timezone = w.timezone
FROM public.workspaces w
WHERE e.timezone = 'UTC'
  AND w.id = e.workspace_id
  AND w.timezone IS NOT NULL
  AND w.timezone <> 'UTC';

-- 6c. Last-resort fallback. After step 1 + 6b this should fire on zero rows
-- in dev (every workspace was just stamped LA in step 1, so step 6b already
-- covered every remaining row). Kept as a safety net for any edge case where
-- the workspace row was deleted out from under an event, or where step 1
-- skipped a non-UTC-but-still-misconfigured workspace; matches the final
-- branch of resolveEventTimezone in src/shared/lib/timezone.ts.
UPDATE ops.events e
SET timezone = 'America/Los_Angeles'
WHERE e.timezone = 'UTC';


-- ─── 7. Validate (warn-only; never abort the transaction) ───────────────────
-- The pre-migration counts from the audit:
--   total: 7, null venue: 4, null client: 5, null location_name: 6,
--   null location_address: 7, default UTC tz: 7.
-- After this migration we expect:
--   - 0 events with timezone='UTC'.
--   - 0 events with null venue_entity_id where a venue_contact stakeholder exists.
--   - 0 events with null client_entity_id where a bill_to stakeholder exists.
--   - 0 events with null location_address where the venue has any address attribute.
DO $$
DECLARE
  utc_event_count       integer;
  unresolved_venue      integer;
  unresolved_client     integer;
  unresolved_addr       integer;
  ws_utc                integer;
BEGIN
  SELECT COUNT(*) INTO utc_event_count FROM ops.events WHERE timezone = 'UTC';
  IF utc_event_count > 0 THEN
    RAISE WARNING 'Backfill: % ops.events row(s) still have timezone=UTC (expected 0)', utc_event_count;
  END IF;

  SELECT COUNT(*) INTO ws_utc FROM public.workspaces WHERE timezone = 'UTC';
  IF ws_utc > 0 THEN
    RAISE WARNING 'Backfill: % workspaces row(s) still have timezone=UTC (expected 0)', ws_utc;
  END IF;

  SELECT COUNT(*) INTO unresolved_venue
  FROM ops.events e
  WHERE e.venue_entity_id IS NULL
    AND e.deal_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM ops.deal_stakeholders s
      WHERE s.deal_id = e.deal_id
        AND s.role = 'venue_contact'
        AND COALESCE(s.organization_id, s.entity_id) IS NOT NULL
    );
  IF unresolved_venue > 0 THEN
    RAISE WARNING 'Backfill: % event(s) still missing venue_entity_id despite resolvable stakeholder (expected 0)', unresolved_venue;
  END IF;

  SELECT COUNT(*) INTO unresolved_client
  FROM ops.events e
  WHERE e.client_entity_id IS NULL
    AND e.deal_id IS NOT NULL
    AND EXISTS (
      SELECT 1 FROM ops.deal_stakeholders s
      WHERE s.deal_id = e.deal_id
        AND s.role = 'bill_to'
        AND COALESCE(s.entity_id, s.organization_id) IS NOT NULL
    );
  IF unresolved_client > 0 THEN
    RAISE WARNING 'Backfill: % event(s) still missing client_entity_id despite resolvable stakeholder (expected 0)', unresolved_client;
  END IF;

  SELECT COUNT(*) INTO unresolved_addr
  FROM ops.events e
  JOIN directory.entities de ON de.id = e.venue_entity_id
  WHERE e.location_address IS NULL
    AND e.venue_entity_id IS NOT NULL
    AND (
      NULLIF(de.attributes->>'formatted_address', '') IS NOT NULL
      OR NULLIF(de.attributes->>'street', '') IS NOT NULL
      OR NULLIF(de.attributes->'address'->>'street', '') IS NOT NULL
    );
  IF unresolved_addr > 0 THEN
    RAISE WARNING 'Backfill: % event(s) still missing location_address despite venue having an address attribute (expected 0)', unresolved_addr;
  END IF;
END $$;

COMMIT;
