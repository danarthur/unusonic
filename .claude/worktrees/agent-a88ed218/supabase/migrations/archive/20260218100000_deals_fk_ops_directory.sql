-- Phase 1 schema correction: point deals FKs to ops and directory.
-- Run after create_deals_table. Idempotent: safe to run if FKs already exist.
-- ARCHIVED: Already applied (FKs and grants in place). Do not run again.

DO $$
BEGIN
  -- Drop legacy event_id FK if it pointed to public.events
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.deals'::regclass AND conname = 'deals_event_id_fkey'
  ) THEN
    ALTER TABLE public.deals DROP CONSTRAINT deals_event_id_fkey;
  END IF;
EXCEPTION
  WHEN undefined_object THEN NULL;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.deals'::regclass AND conname = 'deals_event_id_fkey'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_event_id_fkey
      FOREIGN KEY (event_id) REFERENCES ops.events(id) ON DELETE SET NULL;
  END IF;
END $$;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.deals'::regclass AND conname = 'deals_organization_id_fkey'
  ) THEN
    ALTER TABLE public.deals
      ADD CONSTRAINT deals_organization_id_fkey
      FOREIGN KEY (organization_id) REFERENCES directory.entities(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Ensure roles can read ops and directory for app queries
GRANT USAGE ON SCHEMA ops TO authenticated;
GRANT USAGE ON SCHEMA directory TO authenticated;
GRANT SELECT ON ops.events TO authenticated;
GRANT SELECT ON ops.projects TO authenticated;
GRANT SELECT ON directory.entities TO authenticated;
