-- Phase 2.2 — per-user Lobby layout storage
--
-- Every (user_id, workspace_id, role_slug) triple stores the ordered list of
-- Lobby card IDs (registry IDs from src/shared/lib/metrics/registry.ts). The
-- role_slug is part of the key so a user who switches role inside a workspace
-- (rare but supported) gets per-role layout persistence rather than a blended
-- surface.
--
-- Empty array means "explicit empty" after a reset; a missing row means
-- "never customized — use role defaults." The distinction matters because the
-- swap-from-library UX (Phase 2.3) should not silently re-hydrate role
-- defaults every page load for a user who intentionally cleared their Lobby.

CREATE TABLE public.user_lobby_layout (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  role_slug text NOT NULL,
  card_ids text[] NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, workspace_id, role_slug)
);

ALTER TABLE public.user_lobby_layout ENABLE ROW LEVEL SECURITY;

-- Self-only access. The table is a user preference store; no member of the
-- workspace (including owners) needs to read another user's layout, and the
-- layout itself has no effect on other users' data visibility (the underlying
-- RLS on each widget's data still applies).
CREATE POLICY user_lobby_layout_self
  ON public.user_lobby_layout
  FOR ALL
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

COMMENT ON TABLE public.user_lobby_layout IS
  'Per-user, per-workspace Lobby card ordering. Phase 2.2 of reports & analytics. Cards reference metric IDs from src/shared/lib/metrics/registry.ts. Empty array means "use defaults"; explicit empty array (after a reset) is distinct from missing row.';
