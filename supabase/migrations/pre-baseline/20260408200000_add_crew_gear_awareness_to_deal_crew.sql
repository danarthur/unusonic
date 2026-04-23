-- Phase 1: Crew gear awareness — add brings_own_gear + gear_notes to ops.deal_crew
-- and update RPC to return them (plus missing payment fields).

-- ── New columns ─────────────────────────────────────────────────────────────

ALTER TABLE ops.deal_crew
  ADD COLUMN brings_own_gear boolean NOT NULL DEFAULT false,
  ADD COLUMN gear_notes      text;

COMMENT ON COLUMN ops.deal_crew.brings_own_gear IS 'Whether this crew member supplies their own equipment for this assignment.';
COMMENT ON COLUMN ops.deal_crew.gear_notes      IS 'Freeform notes about what equipment this crew member is bringing.';

-- ── Update RPC to return new + missing payment columns ──────────────────────

CREATE OR REPLACE FUNCTION get_deal_crew_enriched(
  p_deal_id      uuid,
  p_workspace_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops, directory, cortex
AS $$
DECLARE
  v_workspace_org_id uuid;
  v_result           JSONB;
BEGIN
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
      'department',      dc.department,
      'declined_at',     dc.declined_at,
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
      'first_name',      de.attributes->>'first_name',
      'last_name',       de.attributes->>'last_name',
      'job_title',
        COALESCE(
          rel.context_data->>'job_title',
          de.attributes->>'job_title'
        ),
      'phone',           de.attributes->>'phone',
      'email',           de.attributes->>'email',
      'market',          de.attributes->>'market',
      'union_status',    de.attributes->>'union_status',
      'w9_status',       (de.attributes->>'w9_status')::boolean,
      'coi_expiry',      de.attributes->>'coi_expiry',
      'employment_status', rel.context_data->>'employment_status',
      'roster_rel_id',   rel.id,
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
      'package_name',
        (SELECT p.name FROM public.packages p WHERE p.id = dc.catalog_item_id LIMIT 1),
      'dispatch_status',    dc.dispatch_status,
      'call_time',          dc.call_time,
      'call_time_slot_id',  dc.call_time_slot_id,
      'arrival_location',   dc.arrival_location,
      'day_rate',           dc.day_rate,
      'notes',              dc.notes,
      -- Payment fields (were missing from prior RPC version)
      'payment_status',     dc.payment_status,
      'payment_date',       dc.payment_date,
      'travel_stipend',     dc.travel_stipend,
      'per_diem',           dc.per_diem,
      'kit_fee',            dc.kit_fee,
      -- Phase 1: Crew gear awareness
      'brings_own_gear',    dc.brings_own_gear,
      'gear_notes',         dc.gear_notes
    )
    ORDER BY
      (dc.confirmed_at IS NOT NULL) DESC,
      dc.created_at ASC
  )
  INTO v_result
  FROM ops.deal_crew dc
  LEFT JOIN directory.entities de
    ON de.id = dc.entity_id
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
