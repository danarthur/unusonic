-- Phase 2.1 Sprint 3 — archetype role-mix matrix.
--
-- For each (workspace, event_archetype, role_tag) tuple, this table records:
--   * how many of that role the archetype typically requires (qty_required)
--   * whether the role is hard-required vs. optional (is_optional)
--
-- The Phase 2 chip and Conflicts panel consume this to know "what crew does
-- THIS gig type need" — without this, the system can count people but can't
-- tell whether the count is enough for the work.
--
-- Substrate decision (per Visionary synthesis + Critic confirmation):
-- per-workspace seed (not system+override-at-read-time). Matches the
-- precedent set by ops.workspace_job_titles, ops.workspace_skill_presets.
-- Each workspace gets its own copies on creation; owner edits per workspace
-- without affecting system defaults; a future system-default change lands
-- only in NEW workspaces (existing ones keep their customizations).
--
-- Slug references ops.workspace_event_archetypes.slug (loose — the same
-- pattern that table itself uses for system vs workspace rows). Role tag
-- references ops.workspace_job_titles.title (loose).
--
-- Migration discipline (per Phase 2 design doc §3.5): additive only on first
-- pass. No NOT NULL constraint on role_tag yet (covered by table-level NOT
-- NULL). Future migration can tighten.

CREATE TABLE ops.archetype_role_requirements (
  id              uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid          NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  archetype_slug  text          NOT NULL,
  role_tag        text          NOT NULL,
  qty_required    integer       NOT NULL DEFAULT 1 CHECK (qty_required >= 0),
  is_optional     boolean       NOT NULL DEFAULT false,
  notes           text          NULL,
  created_at      timestamptz   NOT NULL DEFAULT now(),
  updated_at      timestamptz   NOT NULL DEFAULT now(),

  -- One row per role per archetype per workspace. Owner can edit qty/optional
  -- but not duplicate. Reusing the role for a second qty group needs new
  -- modeling (out of scope; one row covers the common case).
  CONSTRAINT archetype_role_requirements_unique
    UNIQUE (workspace_id, archetype_slug, role_tag)
);

COMMENT ON TABLE  ops.archetype_role_requirements IS
  'Per-workspace role-mix matrix: which canonical roles a given event_archetype requires, with quantities and optional/required marker. Sprint 3 of Phase 2.1.';
COMMENT ON COLUMN ops.archetype_role_requirements.archetype_slug IS
  'Soft FK to ops.workspace_event_archetypes.slug. Workspace-scoped (system defaults are seeded per-workspace at workspace-create time).';
COMMENT ON COLUMN ops.archetype_role_requirements.role_tag IS
  'Soft FK to ops.workspace_job_titles.title. Same canonical-role-bucket vocabulary used by ops.crew_skills.role_tag.';
COMMENT ON COLUMN ops.archetype_role_requirements.qty_required IS
  'How many of this role the archetype calls for. 1 is the default; concerts/festivals may want 2+ for Audio A2 or Camera Operator.';
COMMENT ON COLUMN ops.archetype_role_requirements.is_optional IS
  'When true: the chip + panel surface this role as optional. When false: the chip flags red if pool is empty.';

-- Lookup: by (workspace, archetype) — the chip + panel hot path.
CREATE INDEX archetype_role_requirements_lookup_idx
  ON ops.archetype_role_requirements (workspace_id, archetype_slug);

-- Reverse lookup: by role_tag — used when a workspace wants to see which
-- archetypes call for a given role (admin tool path, future).
CREATE INDEX archetype_role_requirements_role_idx
  ON ops.archetype_role_requirements (workspace_id, role_tag);

-- updated_at trigger — match the pattern used by ops.workspace_event_archetypes
-- and ops.workspace_job_titles.
CREATE OR REPLACE FUNCTION ops.set_archetype_role_requirements_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = 'pg_catalog'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_archetype_role_requirements_updated_at
  BEFORE UPDATE ON ops.archetype_role_requirements
  FOR EACH ROW
  EXECUTE FUNCTION ops.set_archetype_role_requirements_updated_at();

-- RLS
ALTER TABLE ops.archetype_role_requirements ENABLE ROW LEVEL SECURITY;

-- SELECT: any workspace member can read their workspace's rows.
-- Pattern per CLAUDE.md ops/* RLS — use get_my_workspace_ids().
CREATE POLICY archetype_role_requirements_select
  ON ops.archetype_role_requirements
  FOR SELECT
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

-- INSERT/UPDATE/DELETE: owner or admin only. Matches the gating used by
-- workspace_event_archetypes RPCs (per CLAUDE.md and migrations like
-- 20260422000100_event_archetype_rpcs.sql which use user_has_workspace_role).
CREATE POLICY archetype_role_requirements_insert
  ON ops.archetype_role_requirements
  FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT public.get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY archetype_role_requirements_update
  ON ops.archetype_role_requirements
  FOR UPDATE
  USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  )
  WITH CHECK (
    workspace_id IN (SELECT public.get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY archetype_role_requirements_delete
  ON ops.archetype_role_requirements
  FOR DELETE
  USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

-- Service role bypasses RLS entirely (per ops schema grants since
-- migration 20260410150000). Explicit GRANT for clarity.
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.archetype_role_requirements TO authenticated;
GRANT ALL ON ops.archetype_role_requirements TO service_role;

-- Audit
DO $$
DECLARE
  v_table_exists boolean;
  v_rls_enabled boolean;
  v_policy_count int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'ops' AND table_name = 'archetype_role_requirements'
  ) INTO v_table_exists;

  SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class WHERE oid = 'ops.archetype_role_requirements'::regclass;

  SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies WHERE schemaname = 'ops' AND tablename = 'archetype_role_requirements';

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'Safety audit: ops.archetype_role_requirements not created';
  END IF;
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'Safety audit: RLS not enabled on ops.archetype_role_requirements';
  END IF;
  IF v_policy_count < 4 THEN
    RAISE EXCEPTION 'Safety audit: ops.archetype_role_requirements has % policies, expected 4', v_policy_count;
  END IF;
END $$;
