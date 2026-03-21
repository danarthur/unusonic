-- Packages table for proposal catalog (Deal Room).
-- Referenced by proposal_items.package_id and used by PackageManager + ProposalBuilder.

DO $$ BEGIN
  CREATE TYPE public.package_category AS ENUM ('service', 'rental', 'talent', 'package');
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.packages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  description text,
  category public.package_category NOT NULL DEFAULT 'package',
  price numeric NOT NULL DEFAULT 0 CHECK (price >= 0),
  cost numeric CHECK (cost IS NULL OR cost >= 0),
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.packages IS 'Catalog of packages for proposals (Deal Room).';

CREATE INDEX IF NOT EXISTS packages_workspace_id_idx ON public.packages(workspace_id);
CREATE INDEX IF NOT EXISTS packages_is_active_idx ON public.packages(is_active) WHERE is_active = true;

ALTER TABLE public.packages ENABLE ROW LEVEL SECURITY;

CREATE POLICY packages_workspace_select ON public.packages
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY packages_workspace_insert ON public.packages
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY packages_workspace_update ON public.packages
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY packages_workspace_delete ON public.packages
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );
