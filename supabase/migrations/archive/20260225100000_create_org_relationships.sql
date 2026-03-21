-- org_relationships: B2B connections (vendor, venue, client, partner) between organizations.
-- Used by Network (add connection), network-data (node detail), summoning, intelligence.

-- Enums if not present (safe to run)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'relationship_type') THEN
    CREATE TYPE public.relationship_type AS ENUM ('vendor', 'venue', 'client_company', 'partner');
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'org_relationship_tier') THEN
    CREATE TYPE public.org_relationship_tier AS ENUM ('standard', 'preferred', 'strategic');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.org_relationships (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  source_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  target_org_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  type public.relationship_type NOT NULL DEFAULT 'partner',
  tier public.org_relationship_tier NOT NULL DEFAULT 'standard',
  notes text,
  tags text[],
  lifecycle_status text,
  blacklist_reason text,
  deleted_at timestamptz
);

CREATE INDEX IF NOT EXISTS org_relationships_source_org_id_idx ON public.org_relationships (source_org_id);
CREATE INDEX IF NOT EXISTS org_relationships_target_org_id_idx ON public.org_relationships (target_org_id);
CREATE INDEX IF NOT EXISTS org_relationships_workspace_id_idx ON public.org_relationships (workspace_id);
CREATE INDEX IF NOT EXISTS org_relationships_deleted_at_idx ON public.org_relationships (deleted_at) WHERE deleted_at IS NULL;

ALTER TABLE public.org_relationships ENABLE ROW LEVEL SECURITY;

CREATE POLICY org_relationships_select_workspace ON public.org_relationships
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY org_relationships_insert_workspace ON public.org_relationships
  FOR INSERT
  WITH CHECK (
    auth.uid() IS NOT NULL
    AND workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY org_relationships_update_workspace ON public.org_relationships
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY org_relationships_delete_workspace ON public.org_relationships
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

COMMENT ON TABLE public.org_relationships IS 'B2B links between orgs (vendor/venue/client/partner). Rolodex and Network connections.';
