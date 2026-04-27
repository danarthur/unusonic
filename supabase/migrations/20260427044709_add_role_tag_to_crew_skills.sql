-- Phase 2.1 Sprint 1 — add role_tag column to ops.crew_skills.
--
-- Context: Phase 2 of the date-availability badge needs to count crew by
-- canonical role ("DJ pool: 2 of 2 free", "LD pool: 0 of 1 booked"). Today,
-- ops.crew_skills.skill_tag is freeform technical capability ("GrandMA3",
-- "Allen & Heath SQ-5") — that is the right shape for skills, but it is the
-- wrong shape for role-pool counting. The canonical role taxonomy lives in
-- ops.workspace_job_titles (12 system-seeded titles: DJ, Audio A1, Lighting
-- Director, etc.). This migration adds a `role_tag` column on crew_skills
-- that soft-references workspace_job_titles.title.
--
-- Migration discipline (per Phase 2 design doc §3.5): additive only on first
-- pass. No NOT NULL constraint here. Future migration enforces NOT NULL
-- after backfill (when/if the freeform context_data.role_label column gets
-- populated and the role-mapping admin tool ships in Sprint 5).
--
-- Rollback path: DROP COLUMN role_tag. Safe — no consumer depends on it
-- before the get_role_pool RPC migration that follows.

ALTER TABLE ops.crew_skills
  ADD COLUMN role_tag text;

COMMENT ON COLUMN ops.crew_skills.role_tag IS
  'Canonical role bucket (soft FK to ops.workspace_job_titles.title). Distinct from skill_tag, which is the granular technical capability. A person tagged DJ for role_tag may also have skill_tag rows for "Pioneer DJM-V10", "Serato", etc.';

-- Partial index: only index rows with role_tag set, since most rows will
-- carry skill_tag without role_tag in practice. (skill_tag rows: granular
-- gear-or-software capabilities; role_tag rows: who-can-fill-this-bucket.)
CREATE INDEX IF NOT EXISTS ops_crew_skills_role_tag_idx
  ON ops.crew_skills (workspace_id, role_tag)
  WHERE role_tag IS NOT NULL;

-- Audit
DO $$
DECLARE
  v_col_exists boolean;
  v_idx_exists boolean;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'ops'
      AND table_name = 'crew_skills'
      AND column_name = 'role_tag'
  ) INTO v_col_exists;

  SELECT EXISTS (
    SELECT 1 FROM pg_indexes
    WHERE schemaname = 'ops'
      AND tablename = 'crew_skills'
      AND indexname = 'ops_crew_skills_role_tag_idx'
  ) INTO v_idx_exists;

  IF NOT v_col_exists THEN
    RAISE EXCEPTION 'Safety audit: ops.crew_skills.role_tag column not added';
  END IF;
  IF NOT v_idx_exists THEN
    RAISE EXCEPTION 'Safety audit: ops_crew_skills_role_tag_idx not created';
  END IF;
END $$;
