-- =============================================================================
-- Client-field redesign P0 — Step 2: stakeholder constraints + columns.
--
-- The pre-P0 ops.deal_stakeholders schema enforced UNIQUE (deal_id, entity_id)
-- and UNIQUE (deal_id, organization_id) regardless of role. That blocks the
-- new model where the same person can legitimately appear on a deal in two
-- roles (e.g. a planner who is also the day_of_poc — one entity, two stakeholder
-- rows). It also gives us no way to enforce the "exactly one is_primary host"
-- and "exactly one day_of_poc per deal" invariants race-safely.
--
-- This migration:
--   1. Drops the role-agnostic uniques.
--   2. Adds role-aware composite uniques.
--   3. Adds partial unique indexes for the single-row invariants.
--   4. Adds display_order + added_at columns (is_primary already exists).
--
-- Critic finding B2 fix.
--
-- Depends on: 20260420000000_deal_stakeholder_role_add_p0_values.sql
--   (the partial indexes filter on role = 'host' / 'day_of_poc', which only
--    parse cleanly after those enum values have been committed.)
-- =============================================================================

-- 1. Drop role-agnostic uniques. These two indexes were created in
-- 20260307014128_move_deal_stakeholders_to_ops.sql as ops_deal_stakeholders_*.
-- The drop is in the public schema-search-path-aware form so we don't depend
-- on which schema actually holds the index (Postgres will find it under ops).
DROP INDEX IF EXISTS ops.ops_deal_stakeholders_deal_org_unique;
DROP INDEX IF EXISTS ops.ops_deal_stakeholders_deal_entity_unique;

-- 2. Role-aware composite uniques. Same person can hold multiple roles; a
-- given role+identity combination can only appear once per deal.
CREATE UNIQUE INDEX IF NOT EXISTS ops_deal_stakeholders_deal_org_role_unique
  ON ops.deal_stakeholders (deal_id, organization_id, role)
  WHERE organization_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS ops_deal_stakeholders_deal_entity_role_unique
  ON ops.deal_stakeholders (deal_id, entity_id, role)
  WHERE entity_id IS NOT NULL;

-- 3. Single-row invariants — race-safe via partial unique indexes.
--   - Exactly one is_primary host per deal
--   - Exactly one day_of_poc per deal
-- Concurrent INSERTs racing to set is_primary=true will collide on the
-- partial index and exactly one will win; the other gets a 23505 unique
-- violation. The application code can then either retry or surface an error.
CREATE UNIQUE INDEX IF NOT EXISTS ops_deal_stakeholders_deal_primary_host_unique
  ON ops.deal_stakeholders (deal_id)
  WHERE role = 'host' AND is_primary = true;

CREATE UNIQUE INDEX IF NOT EXISTS ops_deal_stakeholders_deal_day_of_poc_unique
  ON ops.deal_stakeholders (deal_id)
  WHERE role = 'day_of_poc';

-- 4. New columns: display_order powers the People strip ordering on the deal
-- detail (left-to-right chip order) without coupling to CO_HOST edge data;
-- added_at preserves chronology when stakeholders are added incrementally.
ALTER TABLE ops.deal_stakeholders
  ADD COLUMN IF NOT EXISTS display_order smallint,
  ADD COLUMN IF NOT EXISTS added_at timestamptz NOT NULL DEFAULT now();

COMMENT ON COLUMN ops.deal_stakeholders.display_order IS
  'Order within a role group on the deal People strip. Lower = leftmost. NULL = unspecified (renders alphabetical).';
COMMENT ON COLUMN ops.deal_stakeholders.added_at IS
  'Chronological audit of when this stakeholder was attached. Distinct from created_at on the deal itself.';
