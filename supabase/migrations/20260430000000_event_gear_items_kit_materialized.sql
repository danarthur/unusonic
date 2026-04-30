-- =============================================================================
-- Proposal → Gear lineage — Phase 2e/5b additive migration
-- (docs/audits/proposal-gear-lineage-plan-2026-04-29.md §5 Phase 2e, 5b)
--
-- Service-line proposal_items now produce parent gear rows (Phase 2e) and the
-- new materializeKitFromCrew action (Phase 5b) pulls a crew member's verified
-- equipment under that service parent. Those kit-derived child rows need a
-- distinct lineage_source value so the gear card chip + Phase 3 drift logic
-- can tell them apart from `pm_added` (manual one-offs) and `proposal`
-- (materialized straight from the proposal).
--
-- The existing CHECK constraint allows ('proposal','pm_added','pm_swapped',
-- 'pm_detached'). This migration drops it and re-adds with 'kit_materialized'
-- included. No data backfill — no existing rows carry that value.
-- =============================================================================

ALTER TABLE ops.event_gear_items
  DROP CONSTRAINT event_gear_items_lineage_source_check;

ALTER TABLE ops.event_gear_items
  ADD CONSTRAINT event_gear_items_lineage_source_check
    CHECK (lineage_source IN ('proposal', 'pm_added', 'pm_swapped', 'pm_detached', 'kit_materialized'));

COMMENT ON COLUMN ops.event_gear_items.lineage_source IS
  'proposal=came from sync, pm_added=manual, pm_swapped=substituted (links preserved), pm_detached=link broken (Figma-style detach), kit_materialized=pulled from a crew member''s verified kit under a service parent.';
