-- Lobby layout system -- replaces the persona-based user_lobby_layout.
--
-- Two tables:
--   public.lobby_layouts     -- user-created customs (presets live in code)
--   public.user_lobby_active -- per-user active layout pointer
--
-- Presets ('default', 'sales', 'production', 'finance') are defined in code at
-- src/shared/lib/lobby-layouts/presets.ts. Customs are named, editable, capped
-- at 10 per (user, workspace). The active pointer's layout_key is either a
-- preset slug or a lobby_layouts.id uuid.
--
-- The old persona-based table (migration 20260414160000) is dropped: the
-- REPORTS_MODULAR_LOBBY feature flag never shipped enabled in production, so
-- there is no data to preserve.

-- Drop the persona-based user_lobby_layout (flag was off, no production data).
DROP TABLE IF EXISTS public.user_lobby_layout CASCADE;

-- Customs -- user-created layouts. Presets live in code.
CREATE TABLE public.lobby_layouts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name text NOT NULL,
  source_preset_slug text,  -- 'default' | 'sales' | 'production' | 'finance' | NULL for blank
  card_ids text[] NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, workspace_id, name)
);

CREATE INDEX idx_lobby_layouts_user_workspace
  ON public.lobby_layouts (user_id, workspace_id);

ALTER TABLE public.lobby_layouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY lobby_layouts_self ON public.lobby_layouts
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Active layout pointer -- one per (user, workspace). layout_key is either
-- a preset slug ('default', 'sales', 'production', 'finance') or a custom uuid.
CREATE TABLE public.user_lobby_active (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  layout_key text NOT NULL DEFAULT 'default',
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id)
);

ALTER TABLE public.user_lobby_active ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_lobby_active_self ON public.user_lobby_active
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.lobby_layouts IS
  'User-created Lobby layout customs. Presets are code-defined; see src/shared/lib/lobby-layouts/presets.ts. Replaces the persona-based user_lobby_layout.';

COMMENT ON TABLE public.user_lobby_active IS
  'Per-user active layout pointer. layout_key is a preset slug or a lobby_layouts.id.';
