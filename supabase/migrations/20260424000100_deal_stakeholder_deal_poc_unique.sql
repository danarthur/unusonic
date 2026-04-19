-- =============================================================================
-- Partial unique index for deal_poc role (one per deal).
--
-- Mirrors the existing `ops_deal_stakeholders_deal_day_of_poc_unique` index
-- for the day_of_poc role. Separate migration because the new enum value
-- must be committed before it can be referenced in an index predicate.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS ops_deal_stakeholders_deal_deal_poc_unique
  ON ops.deal_stakeholders (deal_id)
  WHERE role = 'deal_poc';
