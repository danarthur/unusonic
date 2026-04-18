-- =============================================================================
-- ops.workspace_event_archetypes — per-workspace event-type taxonomy
--
-- Replaces the hardcoded DEAL_ARCHETYPES enum with a seedable table so
-- production-company owners can add their own types ("Masquerade Ball",
-- "Cigar Tasting") without losing analytics cleanliness.
--
-- Design decisions (per 2026-04-18 Field Expert + User Advocate research):
--   1. System rows live at workspace_id=NULL with is_system=true. Seeded
--      below with the ten legacy archetypes; they are immutable (archive /
--      rename / delete all hard-block against them in the RPCs).
--   2. Custom rows are scoped to a workspace and created via the
--      upsert_workspace_event_archetype RPC by any member.
--   3. A single PARTIAL UNIQUE INDEX on
--      (COALESCE(workspace_id, sentinel-uuid), slug) WHERE archived_at IS NULL
--      prevents a custom row from shadowing a system slug — if any row with
--      slug='wedding' exists as system, no custom 'wedding' can be created.
--   4. Writes go exclusively through SECURITY DEFINER RPCs. RLS on the table
--      allows SELECT for workspace members + system rows, but INSERT / UPDATE
--      / DELETE are all policy-blocked so the normalization + race logic in
--      the RPCs is the only path to mutations.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ops.workspace_event_archetypes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  slug text NOT NULL,
  label text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  archived_at timestamptz,
  created_by_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT workspace_event_archetypes_slug_chk CHECK (slug ~ '^[a-z0-9_]+$' AND length(slug) BETWEEN 1 AND 80),
  CONSTRAINT workspace_event_archetypes_label_chk CHECK (length(trim(label)) BETWEEN 1 AND 80),
  CONSTRAINT workspace_event_archetypes_system_chk CHECK (
    (is_system = true AND workspace_id IS NULL)
    OR (is_system = false AND workspace_id IS NOT NULL)
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS workspace_event_archetypes_slug_unique
  ON ops.workspace_event_archetypes (
    COALESCE(workspace_id, '00000000-0000-0000-0000-000000000000'::uuid),
    slug
  )
  WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS workspace_event_archetypes_workspace_idx
  ON ops.workspace_event_archetypes (workspace_id)
  WHERE archived_at IS NULL;

-- ── Seed system types ────────────────────────────────────────────────────
INSERT INTO ops.workspace_event_archetypes (workspace_id, slug, label, is_system)
VALUES
  (NULL, 'wedding',         'Wedding',         true),
  (NULL, 'corporate_gala',  'Corporate gala',  true),
  (NULL, 'product_launch',  'Product launch',  true),
  (NULL, 'private_dinner',  'Private dinner',  true),
  (NULL, 'concert',         'Concert',         true),
  (NULL, 'festival',        'Festival',        true),
  (NULL, 'awards_show',     'Awards show',     true),
  (NULL, 'conference',      'Conference',      true),
  (NULL, 'birthday',        'Birthday',        true),
  (NULL, 'charity_gala',    'Charity gala',    true)
ON CONFLICT DO NOTHING;

-- ── RLS ──────────────────────────────────────────────────────────────────
ALTER TABLE ops.workspace_event_archetypes ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_event_archetypes_select ON ops.workspace_event_archetypes
  FOR SELECT USING (
    is_system = true
    OR workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY workspace_event_archetypes_no_insert ON ops.workspace_event_archetypes
  FOR INSERT WITH CHECK (false);

CREATE POLICY workspace_event_archetypes_no_update ON ops.workspace_event_archetypes
  FOR UPDATE USING (false);

CREATE POLICY workspace_event_archetypes_no_delete ON ops.workspace_event_archetypes
  FOR DELETE USING (false);

GRANT SELECT ON ops.workspace_event_archetypes TO authenticated;
GRANT ALL ON ops.workspace_event_archetypes TO service_role;
