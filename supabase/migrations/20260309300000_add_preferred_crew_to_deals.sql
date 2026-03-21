-- Add preferred_crew JSONB column to public.deals
-- Stores an array of {entity_id, display_name} objects representing
-- crew members the deal owner intends to assign (pre-handoff signal).
ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS preferred_crew jsonb DEFAULT NULL;

COMMENT ON COLUMN public.deals.preferred_crew IS
  'Array of {entity_id: uuid, display_name: string} — crew nominated at deal stage before event handoff.';
