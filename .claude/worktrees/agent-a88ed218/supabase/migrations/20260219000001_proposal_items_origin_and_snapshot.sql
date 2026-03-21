-- Instance isolation: when adding a package to a proposal we snapshot data and store origin for analytics only.
-- Run this migration only when public.proposal_items exists (e.g. after creating proposals/proposal_items).

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'proposal_items') THEN
    ALTER TABLE public.proposal_items
      ADD COLUMN IF NOT EXISTS origin_package_id uuid REFERENCES public.packages(id) ON DELETE SET NULL,
      ADD COLUMN IF NOT EXISTS definition_snapshot jsonb;

    COMMENT ON COLUMN public.proposal_items.origin_package_id IS 'Analytics only: which master package this line came from. Display uses copied row data.';
    COMMENT ON COLUMN public.proposal_items.definition_snapshot IS 'Deep copy of package.definition at add-to-proposal time.';

    CREATE INDEX IF NOT EXISTS proposal_items_origin_package_id_idx ON public.proposal_items(origin_package_id);
  END IF;
END $$;
