-- Signal Subscription Tiers & User Personas
-- Supports Progressive Disclosure onboarding and tiered agent config
-- Run after main schema (workspaces, profiles if present)

-- Enums
CREATE TYPE public.subscription_tier AS ENUM (
  'foundation',
  'growth',
  'venue_os',
  'autonomous'
);

CREATE TYPE public.user_persona AS ENUM (
  'solo_professional',
  'agency_team',
  'venue_brand'
);

-- Extend workspaces
ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS subscription_tier public.subscription_tier DEFAULT 'foundation',
  ADD COLUMN IF NOT EXISTS stripe_subscription_id text,
  ADD COLUMN IF NOT EXISTS signalpay_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS autonomous_resolution_count integer DEFAULT 0;

-- Extend profiles only if table exists
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'profiles') THEN
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS persona public.user_persona;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_persona_completed boolean DEFAULT false;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_tier_selected boolean DEFAULT false;
    ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS onboarding_signalpay_prompted boolean DEFAULT false;
  END IF;
END $$;

-- Agent config table
CREATE TABLE IF NOT EXISTS public.agent_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  persona public.user_persona NOT NULL,
  tier public.subscription_tier NOT NULL,
  xai_reasoning_enabled boolean DEFAULT true,
  agent_mode text DEFAULT 'assist' CHECK (agent_mode IN ('assist', 'autonomous', 'on_site')),
  modules_enabled text[] DEFAULT ARRAY['crm', 'calendar'],
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(workspace_id)
);

CREATE INDEX IF NOT EXISTS idx_agent_configs_workspace ON public.agent_configs(workspace_id);
ALTER TABLE public.agent_configs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members manage agent config"
ON public.agent_configs FOR ALL
USING (workspace_id IN (SELECT public.get_my_workspace_ids()))
WITH CHECK (workspace_id IN (SELECT public.get_my_workspace_ids()));

-- Autonomous resolution ledger
CREATE TABLE IF NOT EXISTS public.autonomous_resolutions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  agent_name text NOT NULL,
  task_type text NOT NULL,
  reasoning_chain jsonb,
  cost_cents integer DEFAULT 100,
  resolved_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_autonomous_resolutions_workspace ON public.autonomous_resolutions(workspace_id);
ALTER TABLE public.autonomous_resolutions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Workspace members view resolutions"
ON public.autonomous_resolutions FOR SELECT
USING (workspace_id IN (SELECT public.get_my_workspace_ids()));
