-- =============================================================================
-- get_deal_crew_enriched(p_deal_id, p_workspace_id)
--
-- Purpose: Single-query replacement for the N+1 getDealCrew action.
-- Joins ops.deal_crew → directory.entities → ops.crew_skills via lateral join.
-- Also reads the ROSTER_MEMBER cortex edge for employment_status + job_title.
--
-- SECURITY DEFINER: explicit workspace ownership check on deal_crew.workspace_id
-- is the security boundary. Callers MUST pass server-resolved workspace_id
-- (from getActiveWorkspaceId()) — never trust a client-supplied value.
--
-- Returns JSONB array (one object per deal_crew row).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.get_deal_crew_enriched(
  p_deal_id      uuid,
  p_workspace_id uuid
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops, directory, cortex
AS $$
DECLARE
  v_workspace_org_id uuid;
  v_result           JSONB;
BEGIN
  -- Resolve the workspace's company entity (for ROSTER_MEMBER edge filter)
  SELECT id INTO v_workspace_org_id
  FROM directory.entities
  WHERE owner_workspace_id = p_workspace_id
    AND type = 'company'
  LIMIT 1;

  SELECT jsonb_agg(
    jsonb_build_object(
      'id',              dc.id,
      'deal_id',         dc.deal_id,
      'entity_id',       dc.entity_id,
      'role_note',       dc.role_note,
      'source',          dc.source,
      'catalog_item_id', dc.catalog_item_id,
      'confirmed_at',    dc.confirmed_at,
      'created_at',      dc.created_at,
      -- Entity identity (null when entity_id is null = open role slot)
      'entity_name',
        COALESCE(
          NULLIF(TRIM(
            COALESCE(de.attributes->>'first_name', '') || ' ' ||
            COALESCE(de.attributes->>'last_name', '')
          ), ''),
          de.display_name
        ),
      'entity_type',     de.type,
      'avatar_url',      de.avatar_url,
      'is_ghost',        (de.claimed_by_user_id IS NULL),
      -- Person attribute fields
      'first_name',      de.attributes->>'first_name',
      'last_name',       de.attributes->>'last_name',
      'job_title',
        COALESCE(
          rel.context_data->>'job_title',
          de.attributes->>'job_title'
        ),
      'phone',           de.attributes->>'phone',
      'market',          de.attributes->>'market',
      'union_status',    de.attributes->>'union_status',
      'w9_status',       (de.attributes->>'w9_status')::boolean,
      'coi_expiry',      de.attributes->>'coi_expiry',
      -- Employment context from ROSTER_MEMBER edge
      'employment_status', rel.context_data->>'employment_status',
      'roster_rel_id',   rel.id,
      -- Skills array aggregated from ops.crew_skills
      'skills', COALESCE(
        (
          SELECT jsonb_agg(
            jsonb_build_object(
              'id',          cs.id,
              'skill_tag',   cs.skill_tag,
              'proficiency', cs.proficiency,
              'hourly_rate', cs.hourly_rate,
              'verified',    cs.verified
            )
            ORDER BY cs.skill_tag
          )
          FROM ops.crew_skills cs
          WHERE cs.entity_id    = dc.entity_id
            AND cs.workspace_id = p_workspace_id
        ),
        '[]'::jsonb
      ),
      -- Package name resolved inline
      'package_name',
        (SELECT p.name FROM public.packages p WHERE p.id = dc.catalog_item_id LIMIT 1)
    )
    ORDER BY
      (dc.confirmed_at IS NOT NULL) DESC,
      dc.created_at ASC
  )
  INTO v_result
  FROM ops.deal_crew dc
  LEFT JOIN directory.entities de
    ON de.id = dc.entity_id
  -- ROSTER_MEMBER edge — filter to the workspace's own org entity to avoid
  -- multi-org roster ambiguity (a person may be ROSTER_MEMBER of several orgs)
  LEFT JOIN cortex.relationships rel
    ON  rel.source_entity_id   = dc.entity_id
    AND rel.relationship_type  = 'ROSTER_MEMBER'
    AND rel.target_entity_id   = v_workspace_org_id
    AND (rel.context_data->>'deleted_at') IS NULL
  WHERE dc.deal_id      = p_deal_id
    AND dc.workspace_id = p_workspace_id;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_deal_crew_enriched(uuid, uuid) TO authenticated;
