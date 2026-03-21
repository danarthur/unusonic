-- =============================================================================
-- Session 1: Fix data-loss bugs in deal → event handover
--
-- Problem 1: deals has no venue_name column.
--   When a user types a venue in free text (not linked to directory.entities),
--   the name is stored only in client state and lost on submit. venue_id is
--   null, so no venue information survives to the deals row at all.
--
-- Problem 2: ops.events has no event_archetype column.
--   event_archetype is captured at deal creation and stored on deals.
--   When handover-deal.ts creates the ops.events row it has nowhere to put
--   the archetype, so it silently drops it. Every confirmed event loses its
--   type classification.
-- =============================================================================

-- 1. Add venue_name to deals
--    Stores free-text venue entries. When venue_id IS NOT NULL, this mirrors
--    the linked entity's display_name for convenience. When venue_id IS NULL,
--    this is the only record of the user's intended venue.

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS venue_name TEXT;

COMMENT ON COLUMN public.deals.venue_name IS
  'Free-text venue name. Set when venue_id is null (no directory entity selected) '
  'or mirrored from the linked entity display_name when venue_id is set.';

-- 2. Add event_archetype to ops.events
--    Allows handover-deal.ts to copy event_archetype from deals → ops.events
--    so the event type is not lost when a deal is won and crystallized.

ALTER TABLE ops.events
  ADD COLUMN IF NOT EXISTS event_archetype TEXT;

COMMENT ON COLUMN ops.events.event_archetype IS
  'Event type classification copied from deals.event_archetype on handover. '
  'Values: wedding, corporate_gala, product_launch, private_dinner (extensible).';
