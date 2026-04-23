-- =============================================================================
-- Backfill ops.deal_crew from legacy run_of_show_data.crew_items JSONB.
--
-- Wave 4.1 prep for the legacy crew JSONB sweep. Before we delete the
-- normalizeCrewItems read sites, ensure every event that has crew data in
-- run_of_show_data.crew_items also has corresponding ops.deal_crew rows.
--
-- Source of truth going forward: ops.deal_crew (per CLAUDE.md).
-- This migration is idempotent — re-running it inserts nothing if the rows
-- already exist (relies on ON CONFLICT against the deal_crew_deal_entity_uniq
-- partial index which keys on (deal_id, entity_id)).
--
-- Diagnostic query (run before applying to see what would be backfilled):
--   SELECT e.id, e.title,
--          jsonb_array_length(e.run_of_show_data->'crew_items') AS jsonb_count,
--          (SELECT COUNT(*) FROM ops.deal_crew dc WHERE dc.deal_id = e.deal_id) AS deal_crew_count
--     FROM ops.events e
--    WHERE e.deal_id IS NOT NULL
--      AND jsonb_typeof(e.run_of_show_data->'crew_items') = 'array'
--      AND jsonb_array_length(e.run_of_show_data->'crew_items') > 0
--      AND (SELECT COUNT(*) FROM ops.deal_crew dc WHERE dc.deal_id = e.deal_id) = 0;
-- =============================================================================

INSERT INTO ops.deal_crew (
  deal_id,
  workspace_id,
  entity_id,
  role_note,
  source,
  catalog_item_id,
  confirmed_at,
  created_at
)
SELECT
  e.deal_id,
  COALESCE(e.workspace_id, p.workspace_id),
  NULLIF(item->>'entity_id', '')::uuid,
  NULLIF(item->>'role', ''),
  'manual',
  NULLIF(item->>'catalog_item_id', '')::uuid,
  CASE
    WHEN item->>'status' = 'confirmed' THEN COALESCE(
      NULLIF(item->>'status_updated_at', '')::timestamptz,
      now()
    )
    ELSE NULL
  END,
  COALESCE(NULLIF(item->>'created_at', '')::timestamptz, e.created_at, now())
FROM ops.events e
LEFT JOIN ops.projects p ON p.id = e.project_id
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(e.run_of_show_data->'crew_items', '[]'::jsonb)
) AS item
WHERE e.deal_id IS NOT NULL
  AND jsonb_typeof(e.run_of_show_data->'crew_items') = 'array'
  AND COALESCE(e.workspace_id, p.workspace_id) IS NOT NULL
  -- Only backfill events that have NO existing deal_crew rows (don't
  -- overwrite confirmed crew that's already been migrated).
  AND NOT EXISTS (
    SELECT 1 FROM ops.deal_crew dc WHERE dc.deal_id = e.deal_id
  )
  -- Skip rows without an entity_id — they'd violate the unique index when
  -- a deal has multiple unnamed slots, and they're not useful as suggestions
  -- without a person to invite.
  AND NULLIF(item->>'entity_id', '') IS NOT NULL
ON CONFLICT (deal_id, entity_id) DO NOTHING;

-- =============================================================================
-- Audit: count what we did so the deploy log is informative.
-- =============================================================================

DO $$
DECLARE
  v_count integer;
BEGIN
  SELECT COUNT(*) INTO v_count
  FROM ops.deal_crew
  WHERE created_at >= now() - INTERVAL '5 minutes';

  RAISE NOTICE 'backfill_deal_crew_from_jsonb: % rows inserted (or 0 if already migrated)', v_count;
END $$;
