-- =============================================================================
-- Drop public.deals.preferred_crew (vestigial, rescan finding C7)
--
-- Context: the handoff wizard's Step 3 was deleted entirely in Pass 1 (rescan
-- finding B2 — "handoff wizard Step 3 silently drops crew input"). After that
-- fix, the `preferred_crew` JSONB column was still selected and passed
-- through by `get-deal.ts` but never read by any caller. Crew is now managed
-- via `ops.deal_crew` end-to-end.
--
-- This migration drops the column. The TypeScript `DealDetail.preferred_crew`
-- field was already removed in the same commit. When types are regenerated
-- (§6.0 typegen fix), the `public.deals` row type will no longer include it.
-- =============================================================================

ALTER TABLE public.deals
  DROP COLUMN IF EXISTS preferred_crew;

-- Confirmation comment so future schema readers see why the column is gone
COMMENT ON TABLE public.deals IS
  'CRM deals (grandfathered in public schema per CLAUDE.md). Column preferred_crew was dropped 2026-04-12 — it was vestigial after the handoff wizard Step 3 removal (rescan finding C7). Crew is managed via ops.deal_crew.';
