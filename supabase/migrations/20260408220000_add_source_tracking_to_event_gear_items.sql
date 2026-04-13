-- Phase 3: Add source tracking to event_gear_items
-- source column supersedes is_sub_rental for new code, but both coexist.

ALTER TABLE ops.event_gear_items
  ADD COLUMN source text NOT NULL DEFAULT 'company'
    CHECK (source IN ('company', 'crew', 'subrental')),
  ADD COLUMN supplied_by_entity_id uuid,
  ADD COLUMN kit_fee numeric;

-- Backfill: existing sub-rental items get source = 'subrental'
UPDATE ops.event_gear_items
  SET source = 'subrental'
  WHERE is_sub_rental = true;

-- Constraint: crew-sourced items must have a supplier entity
ALTER TABLE ops.event_gear_items
  ADD CONSTRAINT chk_crew_source_entity
    CHECK (source != 'crew' OR supplied_by_entity_id IS NOT NULL);

-- Index for source-based queries (pull sheet filtering, gap analysis)
CREATE INDEX event_gear_items_source_idx ON ops.event_gear_items (event_id, source);

COMMENT ON COLUMN ops.event_gear_items.source IS 'Where gear comes from: company (warehouse), crew (freelancer kit), subrental (third-party rental).';
COMMENT ON COLUMN ops.event_gear_items.supplied_by_entity_id IS 'Person entity who supplies this gear. Required when source=crew.';
COMMENT ON COLUMN ops.event_gear_items.kit_fee IS 'Fee paid to crew member for using their own equipment. Only relevant when source=crew.';
