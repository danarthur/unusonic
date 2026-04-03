-- Gear card upgrade: extend event_gear_items with operator, supplier, history, and expanded status
ALTER TABLE ops.event_gear_items
  ADD COLUMN IF NOT EXISTS operator_entity_id uuid,
  ADD COLUMN IF NOT EXISTS sub_rental_supplier_id uuid,
  ADD COLUMN IF NOT EXISTS history jsonb DEFAULT '[]'::jsonb;

-- Fix status default and constraint
ALTER TABLE ops.event_gear_items ALTER COLUMN status SET DEFAULT 'allocated';
UPDATE ops.event_gear_items SET status = 'allocated' WHERE status = 'pending';
ALTER TABLE ops.event_gear_items DROP CONSTRAINT IF EXISTS event_gear_items_status_check;
ALTER TABLE ops.event_gear_items ADD CONSTRAINT event_gear_items_status_check
  CHECK (status IN ('allocated','pulled','packed','loaded','on_site','returned','quarantine','sub_rented'));

-- Backfill from JSONB for events that have gear in run_of_show_data but no table rows
INSERT INTO ops.event_gear_items (event_id, workspace_id, name, quantity, status, catalog_package_id, is_sub_rental, history, sort_order)
SELECT
  e.id, e.workspace_id, g->>'name',
  COALESCE((g->>'quantity')::int, 1),
  COALESCE(NULLIF(g->>'status', 'pending'), 'allocated'),
  (g->>'catalog_package_id')::uuid,
  COALESCE((g->>'is_sub_rental')::boolean, false),
  COALESCE(g->'history', '[]'::jsonb),
  (row_number() OVER (PARTITION BY e.id ORDER BY ordinality) - 1)::int
FROM ops.events e
CROSS JOIN LATERAL jsonb_array_elements(e.run_of_show_data->'gear_items') WITH ORDINALITY AS t(g, ordinality)
WHERE e.run_of_show_data ? 'gear_items'
  AND jsonb_array_length(e.run_of_show_data->'gear_items') > 0
  AND NOT EXISTS (SELECT 1 FROM ops.event_gear_items egi WHERE egi.event_id = e.id);
