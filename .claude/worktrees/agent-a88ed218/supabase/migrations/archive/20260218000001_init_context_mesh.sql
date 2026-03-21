-- Context Mesh: Decouple Identity from Commercial State
-- User authenticates; Organization holds Subscription Tier

-- Organization type (persona-derived)
DO $$ BEGIN
  CREATE TYPE public.organization_type AS ENUM ('solo', 'agency', 'venue');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Commercial Organizations (tenant = billing entity)
CREATE TABLE IF NOT EXISTS public.commercial_organizations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type public.organization_type NOT NULL DEFAULT 'solo',
  subscription_tier public.subscription_tier NOT NULL DEFAULT 'foundation',
  pms_integration_enabled boolean DEFAULT false,
  signalpay_enabled boolean DEFAULT false,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_commercial_orgs_workspace ON public.commercial_organizations(workspace_id);
ALTER TABLE public.commercial_organizations ENABLE ROW LEVEL SECURITY;

-- Organization members (bridge)
CREATE TABLE IF NOT EXISTS public.organization_members (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.commercial_organizations(id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member' CHECK (role IN ('owner', 'admin', 'member')),
  created_at timestamptz DEFAULT now(),
  PRIMARY KEY (user_id, organization_id)
);

CREATE INDEX IF NOT EXISTS idx_org_members_org ON public.organization_members(organization_id);
CREATE INDEX IF NOT EXISTS idx_org_members_user ON public.organization_members(user_id);
ALTER TABLE public.organization_members ENABLE ROW LEVEL SECURITY;

-- Helper: current user's org IDs
CREATE OR REPLACE FUNCTION public.get_my_organization_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT COALESCE(array_agg(organization_id), ARRAY[]::uuid[])
  FROM public.organization_members WHERE user_id = auth.uid();
$$;

-- RLS: commercial_organizations
CREATE POLICY "Users see own orgs"
ON public.commercial_organizations FOR SELECT
USING (id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()));

CREATE POLICY "Owners admins manage org"
ON public.commercial_organizations FOR ALL
USING (id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')))
WITH CHECK (id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role IN ('owner', 'admin')));

-- RLS: organization_members
CREATE POLICY "Users see own memberships"
ON public.organization_members FOR SELECT
USING (user_id = auth.uid());

CREATE POLICY "Owners manage members"
ON public.organization_members FOR ALL
USING (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'owner'))
WITH CHECK (organization_id IN (SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid() AND role = 'owner'));

-- agent_configs: add organization_id
ALTER TABLE public.agent_configs
  ADD COLUMN IF NOT EXISTS organization_id uuid REFERENCES public.commercial_organizations(id) ON DELETE CASCADE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_configs_org ON public.agent_configs(organization_id) WHERE organization_id IS NOT NULL;

-- RLS: agent_configs
DROP POLICY IF EXISTS "Workspace members manage agent config" ON public.agent_configs;
DROP POLICY IF EXISTS "Org or workspace members manage agent config" ON public.agent_configs;

CREATE POLICY "Org or workspace members manage agent config"
ON public.agent_configs FOR ALL
USING (
  (organization_id IS NOT NULL AND organization_id = ANY(public.get_my_organization_ids()))
  OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT public.get_my_workspace_ids()))
)
WITH CHECK (
  (organization_id IS NOT NULL AND organization_id = ANY(public.get_my_organization_ids()))
  OR (workspace_id IS NOT NULL AND workspace_id IN (SELECT public.get_my_workspace_ids()))
);
