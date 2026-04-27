-- Phase 2.1 fix — Pool RPCs match BOTH role_tag and skill_tag.
--
-- Background: production owners use the existing network entity page
-- (src/app/(dashboard)/network/entity/[id]/EmployeeEntityForm.tsx) to tag
-- crew, and that UI writes ONLY to ops.crew_skills.skill_tag. The Sprint 1
-- migration added a separate role_tag column intended for canonical role
-- buckets, but no existing flow populates it. As a result, the Pool RPC was
-- blind to existing tagged data.
--
-- Fix: A person matches a role pool if EITHER
--   (a) crew_skills.role_tag = p_role_tag  (explicit canonical, from /settings/role-mapping)
--   (b) crew_skills.skill_tag ILIKE p_role_tag  (existing-data-friendly, case-insensitive)
--
-- AND the role tag is in workspace_job_titles (the canonical taxonomy) — the
-- caller already passes a canonical title, so this is implicit at the call
-- site. The fallback is purely additive: explicit role_tag wins; freeform
-- skill_tag data also surfaces.
--
-- Scope: updates ops.get_role_pool (per-role) and ops.get_role_pools_summary
-- (sparse aggregator). get_role_pools_for_archetype is unchanged because it
-- composes get_role_pool internally.

-- ─────────────────────────────────────────────────────────────────────────
-- get_role_pool: dual-column match
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.get_role_pool(
  p_workspace_id uuid,
  p_role_tag     text,
  p_date         date DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public', 'directory', 'cortex'
AS $function$
DECLARE
  v_in_house        jsonb;
  v_preferred       jsonb;
  v_in_house_total  int;
  v_in_house_avail  int;
  v_preferred_total int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  WITH workspace_orgs AS (
    SELECT id FROM directory.entities
    WHERE owner_workspace_id = p_workspace_id
  ),
  in_house_entities AS (
    SELECT DISTINCT e.id, e.display_name
    FROM cortex.relationships r
    JOIN directory.entities e ON e.id = r.target_entity_id
    JOIN ops.crew_skills cs   ON cs.entity_id = e.id
                              AND cs.workspace_id = p_workspace_id
                              -- Dual-column match: explicit role_tag OR
                              -- case-insensitive skill_tag match.
                              AND (cs.role_tag = p_role_tag
                                   OR cs.skill_tag ILIKE p_role_tag)
    WHERE r.relationship_type = 'ROSTER_MEMBER'
      AND r.source_entity_id IN (SELECT id FROM workspace_orgs)
      AND e.type = 'person'
      AND COALESCE(r.context_data->>'lifecycle_status', 'active') = 'active'
      AND r.context_data->>'deleted_at' IS NULL
  ),
  in_house_committed AS (
    SELECT
      ihe.id,
      ihe.display_name,
      CASE
        WHEN p_date IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM ops.deal_crew dc
          JOIN public.deals d ON d.id = dc.deal_id
          WHERE dc.entity_id     = ihe.id
            AND dc.workspace_id  = p_workspace_id
            AND dc.declined_at   IS NULL
            AND dc.confirmed_at  IS NOT NULL
            AND d.archived_at    IS NULL
            AND d.proposed_date  = p_date
        )
        OR EXISTS (
          SELECT 1 FROM ops.deal_crew dc
          JOIN ops.events ev ON ev.deal_id = dc.deal_id
          WHERE dc.entity_id     = ihe.id
            AND dc.workspace_id  = p_workspace_id
            AND dc.declined_at   IS NULL
            AND ev.workspace_id  = p_workspace_id
            AND ev.archived_at   IS NULL
            AND ev.lifecycle_status IS DISTINCT FROM 'cancelled'
            AND ev.lifecycle_status IS DISTINCT FROM 'archived'
            AND (ev.starts_at AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date <= p_date
            AND (COALESCE(ev.ends_at, ev.starts_at) AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date >= p_date
        )
      END AS committed,
      (
        SELECT COALESCE(d.title, ev.title, 'Untitled')
        FROM ops.deal_crew dc
        LEFT JOIN public.deals d ON d.id = dc.deal_id
        LEFT JOIN ops.events ev ON ev.deal_id = dc.deal_id
        WHERE dc.entity_id    = ihe.id
          AND dc.workspace_id = p_workspace_id
          AND dc.declined_at  IS NULL
          AND (
            (p_date IS NOT NULL AND d.proposed_date = p_date)
            OR (p_date IS NOT NULL AND ev.starts_at IS NOT NULL
                AND (ev.starts_at AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date <= p_date
                AND (COALESCE(ev.ends_at, ev.starts_at) AT TIME ZONE COALESCE(ev.timezone, 'UTC'))::date >= p_date)
          )
        LIMIT 1
      ) AS conflict_label
    FROM in_house_entities ihe
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'entity_id',      ihc.id,
      'name',           COALESCE(ihc.display_name, 'Unnamed'),
      'committed',      ihc.committed,
      'conflict_label', ihc.conflict_label
    ) ORDER BY ihc.committed ASC, ihc.display_name NULLS LAST), '[]'::jsonb),
    count(*),
    count(*) FILTER (WHERE NOT ihc.committed)
  INTO v_in_house, v_in_house_total, v_in_house_avail
  FROM in_house_committed ihc;

  WITH workspace_orgs AS (
    SELECT id FROM directory.entities
    WHERE owner_workspace_id = p_workspace_id
  ),
  preferred_entities AS (
    SELECT DISTINCT e.id, e.display_name
    FROM cortex.relationships r
    JOIN directory.entities e ON e.id = r.target_entity_id
    JOIN ops.crew_skills cs   ON cs.entity_id = e.id
                              AND cs.workspace_id = p_workspace_id
                              AND (cs.role_tag = p_role_tag
                                   OR cs.skill_tag ILIKE p_role_tag)
    WHERE r.relationship_type IN ('PARTNER', 'INDUSTRY_PARTNER')
      AND r.context_data->>'tier' = 'preferred'
      AND r.source_entity_id IN (SELECT id FROM workspace_orgs)
      AND e.type = 'person'
      AND COALESCE(r.context_data->>'lifecycle_status', 'active') = 'active'
      AND r.context_data->>'deleted_at' IS NULL
  ),
  preferred_with_history AS (
    SELECT
      pe.id,
      pe.display_name,
      (
        SELECT MAX(dc.confirmed_at)
        FROM ops.deal_crew dc
        WHERE dc.entity_id    = pe.id
          AND dc.workspace_id = p_workspace_id
          AND dc.confirmed_at IS NOT NULL
      ) AS last_used_at
    FROM preferred_entities pe
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object(
      'entity_id',    pwh.id,
      'name',         COALESCE(pwh.display_name, 'Unnamed'),
      'kind',         'person',
      'last_used_at', pwh.last_used_at
    ) ORDER BY pwh.last_used_at DESC NULLS LAST, pwh.display_name NULLS LAST), '[]'::jsonb),
    count(*)
  INTO v_preferred, v_preferred_total
  FROM preferred_with_history pwh;

  RETURN jsonb_build_object(
    'role_tag',          p_role_tag,
    'in_house',          v_in_house,
    'preferred',         v_preferred,
    'in_house_total',    v_in_house_total,
    'in_house_available', v_in_house_avail,
    'preferred_total',   v_preferred_total
  );
END;
$function$;

COMMENT ON FUNCTION ops.get_role_pool(uuid, text, date) IS
  'Phase 2.1 — workspace role pool for a given role_tag. Matches dual-column: explicit ops.crew_skills.role_tag OR case-insensitive ops.crew_skills.skill_tag. The fallback is for existing data tagged via the network entity page (which writes only to skill_tag).';

REVOKE EXECUTE ON FUNCTION ops.get_role_pool(uuid, text, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.get_role_pool(uuid, text, date) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- get_role_pools_summary: sparse mode also discovers skill_tag-tagged roles
-- ─────────────────────────────────────────────────────────────────────────
-- The sparse aggregator (popover when no archetype is set) iterates over
-- distinct role tags. With existing data in skill_tag, it now also picks up
-- skill_tag values that case-insensitively match a workspace_job_titles
-- canonical role.

CREATE OR REPLACE FUNCTION ops.get_role_pools_summary(
  p_workspace_id uuid,
  p_date         date DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
DECLARE
  v_role_tags text[];
  v_pools     jsonb := '[]'::jsonb;
  v_role      text;
  v_pool      jsonb;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Distinct canonical role tags that are populated in this workspace,
  -- via either explicit role_tag or skill_tag matching a workspace_job_titles
  -- title (case-insensitive). Case-folded to the canonical form (job title
  -- as stored) so the response is consistent regardless of input casing.
  SELECT array_agg(DISTINCT canonical_title ORDER BY canonical_title)
  INTO v_role_tags
  FROM (
    -- Explicit role_tag matches
    SELECT jt.title AS canonical_title
    FROM ops.crew_skills cs
    JOIN ops.workspace_job_titles jt
      ON jt.workspace_id = cs.workspace_id
      AND jt.title = cs.role_tag
    WHERE cs.workspace_id = p_workspace_id
      AND cs.role_tag IS NOT NULL
    UNION ALL
    -- skill_tag matches, case-insensitive
    SELECT jt.title AS canonical_title
    FROM ops.crew_skills cs
    JOIN ops.workspace_job_titles jt
      ON jt.workspace_id = cs.workspace_id
      AND lower(jt.title) = lower(cs.skill_tag)
    WHERE cs.workspace_id = p_workspace_id
      AND cs.skill_tag IS NOT NULL
  ) sub;

  IF v_role_tags IS NULL OR array_length(v_role_tags, 1) IS NULL THEN
    RETURN jsonb_build_object(
      'pools',       '[]'::jsonb,
      'total_pools', 0
    );
  END IF;

  FOREACH v_role IN ARRAY v_role_tags LOOP
    v_pool := ops.get_role_pool(p_workspace_id, v_role, p_date);
    v_pools := v_pools || jsonb_build_array(v_pool);
  END LOOP;

  RETURN jsonb_build_object(
    'pools',       v_pools,
    'total_pools', jsonb_array_length(v_pools)
  );
END;
$function$;

COMMENT ON FUNCTION ops.get_role_pools_summary(uuid, date) IS
  'Phase 2.1 — popover-facing aggregate of populated role pools. Discovers roles via either explicit role_tag or skill_tag (case-insensitive match against workspace_job_titles).';

REVOKE EXECUTE ON FUNCTION ops.get_role_pools_summary(uuid, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.get_role_pools_summary(uuid, date) TO authenticated, service_role;

-- Inline smoke test: Daniel's workspace should now surface a DJ pool
-- because Mike SIncere and Noel Perez are tagged "DJ" via skill_tag.
DO $$
DECLARE
  v_daniel_workspace uuid := '96feecb1-ad20-4ad0-bb93-eb3c440efd05';
  v_pool jsonb;
  v_total int;
BEGIN
  -- Skip the check entirely if the workspace doesn't exist (other envs).
  IF NOT EXISTS (SELECT 1 FROM public.workspaces WHERE id = v_daniel_workspace) THEN
    RETURN;
  END IF;

  v_pool := ops.get_role_pool(v_daniel_workspace, 'DJ', NULL);
  v_total := (v_pool->>'in_house_total')::int + (v_pool->>'preferred_total')::int;

  IF v_total = 0 THEN
    RAISE NOTICE 'Smoke note: DJ pool still empty for ITE workspace. Existing skill_tag data may not have ROSTER_MEMBER/PARTNER edges yet.';
  ELSE
    RAISE NOTICE 'Smoke pass: DJ pool surfaces % person(s) for ITE workspace via dual-column match', v_total;
  END IF;
END $$;
