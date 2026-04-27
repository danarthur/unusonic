-- Phase 2.1 fix — Pool RPC counts workspace-owned ghost persons too.
--
-- Background: production data shows persons created via the network page
-- (with crew_skills tagged) but no cortex.relationships edge. Per CLAUDE.md
-- Ghost Protocol, these are valid workspace-owned ghosts. The strict-edge
-- requirement in the previous Pool RPC filtered them out, so the chip
-- showed "DJ — not set up" even though Mike and Noel are tagged DJs.
--
-- Fix: relax the JOIN. A person counts in the pool if EITHER
--   (a) ROSTER_MEMBER edge from a workspace source entity → in_house
--   (b) PARTNER + tier=preferred edge from a workspace source entity → preferred
--   (c) workspace-owned (directory.entities.owner_workspace_id = ws) AND no
--       qualifying edge → preferred (the bench)
--
-- Categorization: in_house if (a), preferred otherwise. Mirrors the User
-- Advocate's hierarchy: "the list" (workspace-known, not formally tier-tagged)
-- counts in the broader pool but isn't shown as inner circle.

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
  -- Anyone in the workspace's directory who matches the role via either column.
  -- Dual-column match: explicit role_tag = p_role_tag OR case-insensitive skill_tag.
  matched_persons AS (
    SELECT DISTINCT e.id, e.display_name
    FROM directory.entities e
    JOIN ops.crew_skills cs ON cs.entity_id = e.id
                            AND cs.workspace_id = p_workspace_id
                            AND (cs.role_tag = p_role_tag
                                 OR cs.skill_tag ILIKE p_role_tag)
    WHERE e.owner_workspace_id = p_workspace_id
      AND e.type = 'person'
  ),
  -- ROSTER_MEMBER edge → in_house. We count anyone whose entity is also
  -- in matched_persons.
  in_house_ids AS (
    SELECT DISTINCT mp.id, mp.display_name
    FROM matched_persons mp
    WHERE EXISTS (
      SELECT 1
      FROM cortex.relationships r
      WHERE r.target_entity_id = mp.id
        AND r.relationship_type = 'ROSTER_MEMBER'
        AND r.source_entity_id IN (SELECT id FROM workspace_orgs)
        AND COALESCE(r.context_data->>'lifecycle_status', 'active') = 'active'
        AND r.context_data->>'deleted_at' IS NULL
    )
  ),
  in_house_committed AS (
    SELECT
      ih.id,
      ih.display_name,
      CASE
        WHEN p_date IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM ops.deal_crew dc
          JOIN public.deals d ON d.id = dc.deal_id
          WHERE dc.entity_id     = ih.id
            AND dc.workspace_id  = p_workspace_id
            AND dc.declined_at   IS NULL
            AND dc.confirmed_at  IS NOT NULL
            AND d.archived_at    IS NULL
            AND d.proposed_date  = p_date
        )
        OR EXISTS (
          SELECT 1 FROM ops.deal_crew dc
          JOIN ops.events ev ON ev.deal_id = dc.deal_id
          WHERE dc.entity_id     = ih.id
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
        WHERE dc.entity_id    = ih.id
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
    FROM in_house_ids ih
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

  WITH preferred_with_history AS (
    SELECT
      pi.id,
      pi.display_name,
      (
        SELECT MAX(dc.confirmed_at)
        FROM ops.deal_crew dc
        WHERE dc.entity_id    = pi.id
          AND dc.workspace_id = p_workspace_id
          AND dc.confirmed_at IS NOT NULL
      ) AS last_used_at
    FROM (
      SELECT DISTINCT e.id, e.display_name
      FROM directory.entities e
      JOIN ops.crew_skills cs ON cs.entity_id = e.id
                              AND cs.workspace_id = p_workspace_id
                              AND (cs.role_tag = p_role_tag
                                   OR cs.skill_tag ILIKE p_role_tag)
      WHERE e.owner_workspace_id = p_workspace_id
        AND e.type = 'person'
        -- Exclude in_house (those are surfaced as the primary pool)
        AND NOT EXISTS (
          SELECT 1
          FROM cortex.relationships r
          JOIN directory.entities src
            ON src.id = r.source_entity_id
            AND src.owner_workspace_id = p_workspace_id
          WHERE r.target_entity_id = e.id
            AND r.relationship_type = 'ROSTER_MEMBER'
            AND COALESCE(r.context_data->>'lifecycle_status', 'active') = 'active'
            AND r.context_data->>'deleted_at' IS NULL
        )
    ) pi
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
  'Phase 2.1 — workspace role pool for a given role_tag. Counts any workspace-owned person whose crew_skills.role_tag matches OR whose skill_tag matches case-insensitively. Categorizes ROSTER_MEMBER edges as in_house, everything else (PARTNER+preferred + edge-less ghosts) as preferred.';

REVOKE EXECUTE ON FUNCTION ops.get_role_pool(uuid, text, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.get_role_pool(uuid, text, date) TO authenticated, service_role;
