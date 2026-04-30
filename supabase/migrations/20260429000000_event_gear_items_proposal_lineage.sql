-- =============================================================================
-- Proposal → Gear lineage — Phase 1 schema migration
-- (docs/audits/proposal-gear-lineage-plan-2026-04-29.md §4)
--
-- Today, when a deal hands off, syncGearFromProposalToEvent seeds rows into
-- ops.event_gear_items but drops every link back to the proposal line that
-- spawned them. After Phase 0 (the sync now consumes proposal_items rather
-- than re-walking definition.blocks) the lineage *exists* in memory at sync
-- time — it just has nowhere to land.
--
-- This migration adds that landing zone:
--   1. ops.event_gear_items gains lineage columns (proposal_item_id,
--      parent_gear_item_id, lineage_source, package_snapshot,
--      is_package_parent, package_instance_id) so the writer in Phase 2
--      can record where each gear row came from and how bundles decompose.
--   2. public.packages gets a per-package decompose_on_gear_card setting
--      so Phase 4's heuristic ('auto') has somewhere to stash the answer
--      and ITE-style service bundles can be locked to 'never' decompose.
--   3. ops.gear_drift_dismissals captures per-line PM rejections of
--      proposal-changed diffs (Phase 3). Re-edits of the proposal after
--      dismissal re-surface the diff because dismissals are pinned to the
--      proposal_item.updated_at frozen at rejection time.
--
-- Existing rows on ops.event_gear_items default to lineage_source='pm_added'
-- which is honest — they pre-date proposal lineage. No data backfill needed.
-- Existing public.packages rows default to decompose_on_gear_card='auto' so
-- behavior is preserved until Phase 2 starts reading the column.
--
-- RLS for new columns on ops.event_gear_items is covered by the existing
-- workspace_id-scoped policies (column-additive). RLS for the new
-- gear_drift_dismissals table follows the standard ops.* pattern using
-- public.get_my_workspace_ids().
-- =============================================================================

-- 1. ops.event_gear_items lineage columns -------------------------------------

ALTER TABLE ops.event_gear_items
  ADD COLUMN proposal_item_id uuid NULL
    REFERENCES public.proposal_items(id) ON DELETE SET NULL,
  ADD COLUMN parent_gear_item_id uuid NULL
    REFERENCES ops.event_gear_items(id) ON DELETE CASCADE,
  ADD COLUMN lineage_source text NOT NULL DEFAULT 'pm_added'
    CHECK (lineage_source IN ('proposal', 'pm_added', 'pm_swapped', 'pm_detached')),
  ADD COLUMN package_snapshot jsonb NULL,
  ADD COLUMN is_package_parent boolean NOT NULL DEFAULT false,
  ADD COLUMN package_instance_id uuid NULL;

CREATE INDEX event_gear_items_proposal_item_idx
  ON ops.event_gear_items (proposal_item_id);

CREATE INDEX event_gear_items_parent_idx
  ON ops.event_gear_items (parent_gear_item_id);

CREATE INDEX event_gear_items_package_instance_idx
  ON ops.event_gear_items (event_id, package_instance_id)
  WHERE package_instance_id IS NOT NULL;

COMMENT ON COLUMN ops.event_gear_items.proposal_item_id IS
  'FK to public.proposal_items(id). NULL for PM-added rows. SET NULL on proposal deletion to preserve gear plan.';
COMMENT ON COLUMN ops.event_gear_items.parent_gear_item_id IS
  'Self-FK for bundle hierarchy. Children of a package parent reference the parent row. CASCADE delete when parent goes.';
COMMENT ON COLUMN ops.event_gear_items.lineage_source IS
  'proposal=came from sync, pm_added=manual, pm_swapped=substituted (links preserved), pm_detached=link broken (Figma-style detach).';
COMMENT ON COLUMN ops.event_gear_items.package_snapshot IS
  'Bundle definition frozen at handoff time. Versioned: { v: 1, name, blocks[], category, decomposed, ... }. Master catalog edits never rewrite this.';
COMMENT ON COLUMN ops.event_gear_items.is_package_parent IS
  'TRUE for the "L1 Package" header row that owns N child rows. Renders as collapsible group on gear card.';
COMMENT ON COLUMN ops.event_gear_items.package_instance_id IS
  'Mirrors public.proposal_items.package_instance_id. Sibling-grouping inside one event. Used for fast diff lookups.';


-- 2. public.packages decomposition control ------------------------------------

ALTER TABLE public.packages
  ADD COLUMN decompose_on_gear_card text NOT NULL DEFAULT 'auto'
    CHECK (decompose_on_gear_card IN ('auto', 'always', 'never'));

COMMENT ON COLUMN public.packages.decompose_on_gear_card IS
  'auto = decompose if rentals dominate, stay whole if all services. always/never override the heuristic. Snapshotted onto ops.event_gear_items.package_snapshot at handoff.';


-- 3. ops.gear_drift_dismissals ------------------------------------------------

CREATE TABLE ops.gear_drift_dismissals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id uuid NOT NULL REFERENCES ops.events(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL,
  proposal_item_id uuid NOT NULL,
  proposal_item_updated_at timestamptz NOT NULL,
  dismissed_by uuid NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  dismissed_at timestamptz NOT NULL DEFAULT now(),
  reason text NULL
);

CREATE INDEX gear_drift_dismissals_event_idx
  ON ops.gear_drift_dismissals (event_id, proposal_item_id);

ALTER TABLE ops.gear_drift_dismissals ENABLE ROW LEVEL SECURITY;

CREATE POLICY gear_drift_dismissals_select ON ops.gear_drift_dismissals
  FOR SELECT USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY gear_drift_dismissals_insert ON ops.gear_drift_dismissals
  FOR INSERT WITH CHECK (workspace_id IN (SELECT public.get_my_workspace_ids()));

COMMENT ON TABLE ops.gear_drift_dismissals IS
  'Per-line PM rejections of proposal-changed diffs (proposal-gear-lineage-plan §4.3). proposal_item_updated_at pins the dismissal to the proposal version at rejection time so future edits re-surface the diff.';
