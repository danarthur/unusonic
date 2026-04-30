-- =============================================================================
-- Add `updated_at` to `public.proposal_items` so Phase 3 drift detection
-- (proposal-gear-lineage-plan §5 Phase 3) can pin a per-line dismissal to
-- the proposal version at rejection time. Without this column, dismissals
-- would have to use the proposal's coarse-grained updated_at — which means
-- every PM rejection sticks until the entire proposal is touched, even if
-- only one other line later changed. The plan's per-line semantics need
-- per-line versioning.
--
-- Existing rows get `now()` as their initial value (acts as the baseline
-- since the column did not exist before). A BEFORE UPDATE trigger keeps
-- the column current on every subsequent edit.
-- =============================================================================

ALTER TABLE public.proposal_items
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE OR REPLACE FUNCTION public._proposal_items_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER proposal_items_touch_updated_at
  BEFORE UPDATE ON public.proposal_items
  FOR EACH ROW
  EXECUTE FUNCTION public._proposal_items_touch_updated_at();

COMMENT ON COLUMN public.proposal_items.updated_at IS
  'Trigger-maintained timestamp (set on every UPDATE) used by gear drift detection to compare against ops.gear_drift_dismissals.proposal_item_updated_at.';
