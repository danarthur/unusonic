-- =============================================================================
-- Create ops.crew_skills
--
-- Purpose: Normalized skill tags per person entity per workspace.
-- Replaces the dead public.talent_skills (keyed to dropped org_members).
--
-- entity_id is a soft reference to directory.entities — Ghost Protocol allows
-- ghost entities to carry skills before they claim an account.
--
-- proficiency: references the public.skill_level enum (already exists).
-- hourly_rate: per-skill rate override; nullable — falls back to ROSTER_MEMBER
--              edge context_data.default_hourly_rate.
-- =============================================================================

CREATE TABLE ops.crew_skills (
  id           uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id    uuid        NOT NULL,
  workspace_id uuid        NOT NULL,
  skill_tag    text        NOT NULL CHECK (char_length(skill_tag) BETWEEN 1 AND 120),
  proficiency  public.skill_level,
  hourly_rate  numeric(10,2),
  verified     boolean     NOT NULL DEFAULT false,
  notes        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),

  CONSTRAINT crew_skills_entity_workspace_tag_uniq
    UNIQUE (entity_id, workspace_id, skill_tag)
);

COMMENT ON TABLE ops.crew_skills IS
  'Normalized skill tags per person entity per workspace. Replaces public.talent_skills (keyed to dropped org_members). entity_id is a soft reference to directory.entities — Ghost Protocol.';

CREATE INDEX crew_skills_entity_workspace_idx ON ops.crew_skills (entity_id, workspace_id);
CREATE INDEX crew_skills_skill_tag_idx ON ops.crew_skills (skill_tag);

ALTER TABLE ops.crew_skills ENABLE ROW LEVEL SECURITY;

CREATE POLICY crew_skills_select ON ops.crew_skills
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY crew_skills_insert ON ops.crew_skills
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY crew_skills_update ON ops.crew_skills
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY crew_skills_delete ON ops.crew_skills
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.crew_skills TO authenticated;

CREATE OR REPLACE FUNCTION ops.set_crew_skills_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER crew_skills_updated_at
  BEFORE UPDATE ON ops.crew_skills
  FOR EACH ROW EXECUTE FUNCTION ops.set_crew_skills_updated_at();
