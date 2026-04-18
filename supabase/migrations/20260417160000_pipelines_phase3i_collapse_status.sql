-- =============================================================================
-- Custom Pipelines — Phase 3i: collapse status slugs to kinds (irreversible)
--
-- Full design: docs/reference/custom-pipelines-design.md §4.3
--
-- Phase 3i Sub-Phase A shipped the BEFORE trigger + canonical RPCs that make
-- stage_id the source of truth. Sub-Phase B flipped every writer in the app
-- to target stage_id. This migration is the one-shot data collapse that:
--
--   1. Rewrites every legacy slug in public.deals.status to its kind by
--      joining against the deal's stage. 'inquiry' / 'proposal' /
--      'contract_sent' / 'contract_signed' / 'deposit_received' all become
--      'working'. 'won' and 'lost' stay as-is. Deals without stage_id (none
--      should exist post-Phase-1, but defensive) keep their current value.
--
--   2. Adds back the CHECK constraint dropped in Phase 2d-1, now with the
--      three-value kind enum {'working','won','lost'}.
--
-- This is IRREVERSIBLE — once the data migration runs, the specific legacy
-- slug a deal was in can only be reconstructed from its stage_id. The
-- design-doc invariant is that stage_id IS the source of truth, so this is
-- the intended endpoint.
--
-- Order of operations matters:
--   • The UPDATE runs FIRST. If the CHECK constraint were added first, the
--     UPDATE itself would have to land on rows that temporarily violate it.
--   • The CHECK constraint is added LAST, in the same transaction. Any row
--     that somehow escaped the collapse (e.g. a new INSERT mid-transaction)
--     would fail the constraint — correct behavior.
-- =============================================================================


-- =============================================================================
-- 1. Collapse status → stage.kind for every deal that has a stage_id.
--
--    Defensive: skip rows where the collapsed value would equal the current
--    value (avoids churn + keeps deal_transitions clean — an UPDATE OF status
--    alone doesn't fire the trigger since the trigger is now OF stage_id).
-- =============================================================================

UPDATE public.deals d
SET status = s.kind,
    updated_at = now()
FROM ops.pipeline_stages s
WHERE d.stage_id = s.id
  AND d.status IS DISTINCT FROM s.kind;


-- =============================================================================
-- 2. Re-add the CHECK constraint with the three-value kind enum.
--
--    Phase 2d-1 dropped deals_status_check so workspaces could rename stages
--    to arbitrary slugs. Phase 3i restores a tighter constraint: status is
--    always one of the three kinds, because stage.kind is the only thing
--    writers set it to.
-- =============================================================================

ALTER TABLE public.deals
  ADD CONSTRAINT deals_status_check
  CHECK (status IN ('working', 'won', 'lost'));


COMMENT ON CONSTRAINT deals_status_check ON public.deals IS
  'Phase 3i: public.deals.status is the denormalized kind of the current stage. Writers target stage_id; the BEFORE trigger sync_deal_status_from_stage derives status = stage.kind on every insert/update. The CHECK enforces that no path can set status to a legacy slug.';
