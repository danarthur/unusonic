-- Tier 2 Phase 7b — compelling_event column on deals.
-- Field Expert J: "the why" is the single most predictive field in sales
-- research for close probability. One optional field, owner-entered, fed
-- into Aion's voice when set. No profiling, no learning — just a labeled
-- anchor.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS compelling_event text;

COMMENT ON COLUMN public.deals.compelling_event IS
  'Owner-entered "drop-dead reason" the client needs this deal closed by a specific date. Examples: "daughter''s wedding May 3", "company 10-yr anniversary gala", "tour kickoff".  Not a date itself (that lives on ops.events.starts_at); the WHY behind the date. Feeds Aion card voice when set. See docs/reference/aion-deal-card-unified-design.md Phase 7b.';
