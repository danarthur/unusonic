-- Give existing crew skills their normalised role, so role filters have
-- something to read.
--
-- ops.crew_skills carries two columns by design: skill_tag keeps whatever was
-- typed, role_tag carries the normalised value that grouping and filtering use.
-- Every row in this workspace has the first and none has the second, so every
-- surface that filters by role reads an empty set -- which is why the roster
-- fell back to free-text job titles and the other sections showed no role chips
-- at all.
--
-- The values are already there and already sensible ("DJ", "Lighting"). They
-- have simply never been normalised.
--
-- This does NOT seed ops.workspace_crew_roles. That table supplies the display
-- LABEL for a slug, and the category sections drop any role they cannot label,
-- so the chips stay hidden until the vocabulary is seeded from Settings ->
-- Network tags. That ordering is deliberate: the data lands first and lights up
-- when the vocabulary arrives, rather than the vocabulary arriving to find
-- nothing tagged.

-- Mirrors normalizeRoleLabel in role-vocabulary.ts. The slugs must agree
-- exactly, or a backfilled "dj" will not match the seeded "dj" and the two
-- halves will never meet.
--
-- The one deliberate difference: the TypeScript normalises to NFKC first, which
-- Postgres cannot do without an extension. That only matters for compatibility
-- characters -- full-width Latin, ligatures -- which do not appear in a role
-- name typed on a normal keyboard. Rows that somehow contain them keep a NULL
-- role_tag rather than getting a wrong one.
CREATE OR REPLACE FUNCTION ops.normalize_role_label(p_input text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'pg_catalog'
AS $$
  SELECT nullif(
    regexp_replace(
      regexp_replace(
        regexp_replace(
          regexp_replace(lower(btrim(p_input)), '[^a-z0-9 \-/]+', '', 'g'),
          '[ \-/]+', '_', 'g'),
        '^_+|_+$', '', 'g'),
      '_+', '_', 'g'),
    '');
$$;

COMMENT ON FUNCTION ops.normalize_role_label(text) IS
  'Role label to slug. Must stay in step with normalizeRoleLabel in src/entities/network/model/role-vocabulary.ts.';

-- Fill only what is empty. A role_tag already set was set deliberately, and a
-- backfill that overwrites is a backfill nobody can run twice.
UPDATE ops.crew_skills
   SET role_tag = ops.normalize_role_label(skill_tag)
 WHERE role_tag IS NULL
   AND skill_tag IS NOT NULL
   AND ops.normalize_role_label(skill_tag) IS NOT NULL;

-- Fail rather than half-finish. Anything left unnormalised here has a skill_tag
-- that survives none of the slug rules -- punctuation or symbols only -- and is
-- worth looking at rather than silently skipping.
DO $$
DECLARE
  v_unfilled bigint;
BEGIN
  SELECT count(*) INTO v_unfilled
    FROM ops.crew_skills
   WHERE role_tag IS NULL
     AND skill_tag IS NOT NULL
     AND ops.normalize_role_label(skill_tag) IS NOT NULL;

  IF v_unfilled > 0 THEN
    RAISE EXCEPTION 'backfill left % crew_skills rows without a role_tag', v_unfilled;
  END IF;
END $$;

REVOKE ALL ON FUNCTION ops.normalize_role_label(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.normalize_role_label(text) FROM anon;
GRANT EXECUTE ON FUNCTION ops.normalize_role_label(text) TO authenticated, service_role;
