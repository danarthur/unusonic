-- App compatibility: public.affiliations and public.org_members (createGenesisOrganization / Network create-org).

-- Enums if not present (safe to run; will error only if values conflict)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'affiliation_access_level') THEN
    CREATE TYPE public.affiliation_access_level AS ENUM ('admin', 'member', 'read_only');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'employment_status') THEN
    CREATE TYPE public.employment_status AS ENUM ('internal_employee', 'external_contractor');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_member_role') THEN
    CREATE TYPE public.org_member_role AS ENUM ('owner', 'admin', 'member', 'restricted');
  END IF;
END$$;

-- affiliations: links entity (person) to organization with role/access
CREATE TABLE IF NOT EXISTS public.affiliations (
  entity_id uuid NOT NULL REFERENCES public.entities(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  role_label text,
  status text NOT NULL DEFAULT 'active',
  access_level public.affiliation_access_level NOT NULL DEFAULT 'member',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (entity_id, organization_id)
);

CREATE INDEX IF NOT EXISTS affiliations_organization_id_idx ON public.affiliations (organization_id);
CREATE INDEX IF NOT EXISTS affiliations_entity_id_idx ON public.affiliations (entity_id);

ALTER TABLE public.affiliations ENABLE ROW LEVEL SECURITY;

CREATE POLICY affiliations_select_workspace ON public.affiliations
  FOR SELECT
  USING (
    organization_id IN (
      SELECT id FROM public.organizations
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY affiliations_insert_workspace ON public.affiliations
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND organization_id IN (
      SELECT id FROM public.organizations
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY affiliations_update_workspace ON public.affiliations
  FOR UPDATE
  USING (
    organization_id IN (
      SELECT id FROM public.organizations
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

CREATE POLICY affiliations_delete_workspace ON public.affiliations
  FOR DELETE
  USING (
    organization_id IN (
      SELECT id FROM public.organizations
      WHERE workspace_id IN (
        SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
      )
    )
  );

-- org_members: roster row per entity per org (Network Core / getCurrentOrgId)
CREATE TABLE IF NOT EXISTS public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  entity_id uuid REFERENCES public.entities(id) ON DELETE SET NULL,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  profile_id uuid,
  first_name text,
  last_name text,
  job_title text,
  phone text,
  avatar_url text,
  employment_status public.employment_status NOT NULL DEFAULT 'internal_employee',
  role public.org_member_role NOT NULL DEFAULT 'member',
  default_hourly_rate numeric NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS org_members_org_id_idx ON public.org_members (org_id);
CREATE INDEX IF NOT EXISTS org_members_entity_id_idx ON public.org_members (entity_id);
CREATE INDEX IF NOT EXISTS org_members_workspace_id_idx ON public.org_members (workspace_id);

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_members_select_workspace ON public.org_members
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY org_members_insert_workspace ON public.org_members
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY org_members_update_workspace ON public.org_members
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY org_members_delete_workspace ON public.org_members
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.affiliations IS 'Links entities to organizations (role/access). App compatibility for createGenesisOrganization.';
COMMENT ON TABLE public.org_members IS 'Roster: entity membership in an org. Used by Network Core and getCurrentOrgId.';
