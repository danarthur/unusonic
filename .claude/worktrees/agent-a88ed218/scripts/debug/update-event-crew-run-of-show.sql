-- =============================================================================
-- Set crew roles on an event so the CRM Plan lens shows "DJ - requested" etc.
-- Run in Supabase Dashboard → SQL Editor. No MCP required.
-- Replace EVENT_ID with the ops.events.id for the event you're viewing in CRM.
-- =============================================================================

-- 1) Find your event: list recent ops.events (copy the id you want)
SELECT e.id AS event_id, e.name, e.start_at, p.name AS project_name
FROM ops.events e
JOIN ops.projects p ON p.id = e.project_id
ORDER BY e.start_at DESC NULLS LAST
LIMIT 20;

-- 2) Set crew on one event (replace EVENT_ID with a uuid from query 1)
--    Merges crew_roles and crew_items into existing run_of_show_data so the UI shows "DJ - Requested"
--    (keeps any existing gear_requirements, logistics, etc.)
UPDATE ops.events
SET run_of_show_data = COALESCE(run_of_show_data, '{}'::jsonb)
  || jsonb_build_object(
       'crew_roles', COALESCE(run_of_show_data->'crew_roles', '[]'::jsonb) || '["DJ"]'::jsonb,
       'crew_items', COALESCE(run_of_show_data->'crew_items', '[]'::jsonb) || '[{"role": "DJ", "status": "requested"}]'::jsonb
     )
WHERE id = 'EVENT_ID';

-- Multiple roles (e.g. DJ + Lead): use this variant and replace EVENT_ID
-- UPDATE ops.events
-- SET run_of_show_data = COALESCE(run_of_show_data, '{}'::jsonb)
--   || jsonb_build_object(
--        'crew_roles', '["DJ", "Lead"]'::jsonb,
--        'crew_items', '[{"role": "DJ", "status": "requested"}, {"role": "Lead", "status": "requested"}]'::jsonb
--      )
-- WHERE id = 'EVENT_ID';

-- 3) Verify (replace EVENT_ID)
SELECT id, name, run_of_show_data
FROM ops.events
WHERE id = 'EVENT_ID';
