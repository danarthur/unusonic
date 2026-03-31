-- Add entity-based deal ownership (replaces owner_user_id)
-- owner_entity_id points at directory.entities so ghost profiles can own deals
ALTER TABLE public.deals ADD COLUMN IF NOT EXISTS owner_entity_id uuid REFERENCES directory.entities(id);

-- Backfill from owner_user_id → entity claimed_by_user_id
UPDATE public.deals d
SET owner_entity_id = e.id
FROM directory.entities e
WHERE d.owner_user_id IS NOT NULL
  AND e.claimed_by_user_id = d.owner_user_id
  AND d.owner_entity_id IS NULL;
