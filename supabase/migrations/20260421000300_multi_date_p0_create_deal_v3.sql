-- =============================================================================
-- Multi-date P0 — create_deal_complete v3 (adds date kind + project creation)
--
-- Extends the v2 cast-of-stakeholders RPC with:
--   1. `p_date_kind`  — 'single' | 'multi_day' | 'series'
--   2. `p_date`        — jsonb shape varies per kind:
--        single:     {}                       (date comes from p_deal.proposed_date)
--        multi_day:  { end_date: 'yyyy-MM-dd' }  (written to deals.proposed_end_date)
--        series:     { series_rule: {...}, series_archetype: 'residency' | ... }
--                    primary_date is read from series_rule.primary_date and
--                    written to deals.proposed_date, overriding any value in p_deal.
--   3. Always creates an ops.projects row linked to the deal (deal_id set).
--      Singletons and multi-day default to is_series = false; series flip to
--      is_series = true and persist series_rule.
--
-- Events are NOT materialized here. handoverDeal creates ops.events when the
-- deal is won — for series, it expands series_rule into N event rows.
-- =============================================================================

DROP FUNCTION IF EXISTS public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text);

CREATE OR REPLACE FUNCTION public.create_deal_complete(
  p_workspace_id uuid,
  p_hosts jsonb,
  p_poc jsonb DEFAULT NULL,
  p_bill_to jsonb DEFAULT NULL,
  p_planner jsonb DEFAULT NULL,
  p_venue_entity jsonb DEFAULT NULL,
  p_deal jsonb DEFAULT '{}'::jsonb,
  p_note jsonb DEFAULT NULL,
  p_pairing text DEFAULT 'romantic',
  p_date_kind text DEFAULT 'single',
  p_date jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_host_shape jsonb;
  v_host_ids uuid[] := ARRAY[]::uuid[];
  v_host_types text[] := ARRAY[]::text[];
  v_resolved_id uuid;
  v_resolved_type text;
  v_primary_host_id uuid;
  v_primary_host_type text;
  v_bill_to_id uuid;
  v_bill_to_type text;
  v_poc_id uuid;
  v_planner_id uuid;
  v_venue_id uuid;
  v_deal_id uuid;
  v_project_id uuid;
  v_org_id_for_deals uuid;
  v_idx int;
  v_a uuid;
  v_b uuid;
  v_a_type text;
  v_b_type text;
  v_co_host_ctx jsonb;
  v_series_rule jsonb;
  v_series_archetype text;
  v_primary_date date;
  v_proposed_end_date date;
  v_project_name text;
BEGIN
  -- 1. Authn + workspace authz
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'create_deal_complete: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'create_deal_complete: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- 2. Hosts
  IF p_hosts IS NULL OR jsonb_typeof(p_hosts) <> 'array' OR jsonb_array_length(p_hosts) = 0 THEN
    RAISE EXCEPTION 'create_deal_complete: p_hosts must be a non-empty jsonb array' USING ERRCODE = '22023';
  END IF;

  IF p_pairing NOT IN ('romantic', 'co_host', 'family') THEN
    RAISE EXCEPTION 'create_deal_complete: invalid pairing %', p_pairing USING ERRCODE = '22023';
  END IF;

  IF p_date_kind NOT IN ('single', 'multi_day', 'series') THEN
    RAISE EXCEPTION 'create_deal_complete: invalid date_kind %', p_date_kind USING ERRCODE = '22023';
  END IF;

  -- 3. Resolve date shape and validate series_rule up-front so we fail fast
  --    before writing any rows.
  IF p_date_kind = 'multi_day' THEN
    IF p_date IS NULL OR (p_date ->> 'end_date') IS NULL THEN
      RAISE EXCEPTION 'create_deal_complete: multi_day requires p_date.end_date' USING ERRCODE = '22023';
    END IF;
    v_proposed_end_date := (p_date ->> 'end_date')::date;
  END IF;

  IF p_date_kind = 'series' THEN
    IF p_date IS NULL OR (p_date -> 'series_rule') IS NULL THEN
      RAISE EXCEPTION 'create_deal_complete: series requires p_date.series_rule' USING ERRCODE = '22023';
    END IF;
    v_series_rule := p_date -> 'series_rule';
    v_series_archetype := p_date ->> 'series_archetype';
    IF v_series_archetype IS NOT NULL
       AND v_series_archetype NOT IN ('residency', 'tour', 'run', 'weekend', 'custom') THEN
      RAISE EXCEPTION 'create_deal_complete: invalid series_archetype %', v_series_archetype USING ERRCODE = '22023';
    END IF;
    IF (v_series_rule ->> 'primary_date') IS NULL
       OR jsonb_typeof(v_series_rule -> 'rdates') <> 'array'
       OR jsonb_array_length(v_series_rule -> 'rdates') = 0 THEN
      RAISE EXCEPTION 'create_deal_complete: series_rule requires primary_date and non-empty rdates' USING ERRCODE = '22023';
    END IF;
    v_primary_date := (v_series_rule ->> 'primary_date')::date;
  END IF;

  -- 4. Resolve / create host entities
  FOR v_idx IN 0 .. jsonb_array_length(p_hosts) - 1 LOOP
    v_host_shape := p_hosts -> v_idx;

    IF v_host_shape ? 'existing_id' AND (v_host_shape ->> 'existing_id') IS NOT NULL THEN
      v_resolved_id := (v_host_shape ->> 'existing_id')::uuid;
      SELECT type INTO v_resolved_type FROM directory.entities WHERE id = v_resolved_id;
      IF v_resolved_type IS NULL THEN
        RAISE EXCEPTION 'create_deal_complete: host % does not exist', v_resolved_id USING ERRCODE = '22023';
      END IF;
    ELSIF (v_host_shape ->> 'type') IS NOT NULL THEN
      v_resolved_type := v_host_shape ->> 'type';
      IF v_resolved_type NOT IN ('person', 'company') THEN
        RAISE EXCEPTION 'create_deal_complete: invalid host type %', v_resolved_type USING ERRCODE = '22023';
      END IF;
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id, v_resolved_type,
        COALESCE(v_host_shape ->> 'display_name', 'Host'),
        NULL,
        COALESCE(v_host_shape -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_resolved_id;
    ELSE
      RAISE EXCEPTION 'create_deal_complete: host shape missing both existing_id and type' USING ERRCODE = '22023';
    END IF;

    v_host_ids := array_append(v_host_ids, v_resolved_id);
    v_host_types := array_append(v_host_types, v_resolved_type);
  END LOOP;

  v_primary_host_id := v_host_ids[1];
  v_primary_host_type := v_host_types[1];

  -- 5. POC (optional)
  IF p_poc IS NOT NULL THEN
    IF (p_poc ->> 'existing_id') IS NOT NULL THEN
      v_poc_id := (p_poc ->> 'existing_id')::uuid;
    ELSIF (p_poc ->> 'type') IS NOT NULL THEN
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id, p_poc ->> 'type',
        COALESCE(p_poc ->> 'display_name', 'Point of contact'),
        NULL,
        COALESCE(p_poc -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_poc_id;
    END IF;
  END IF;

  -- 6. Planner (optional)
  IF p_planner IS NOT NULL THEN
    IF (p_planner ->> 'existing_id') IS NOT NULL THEN
      v_planner_id := (p_planner ->> 'existing_id')::uuid;
    ELSIF (p_planner ->> 'type') IS NOT NULL THEN
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id, p_planner ->> 'type',
        COALESCE(p_planner ->> 'display_name', 'Planner'),
        NULL,
        COALESCE(p_planner -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_planner_id;
    END IF;
  END IF;

  -- 7. Bill-to (defaults to primary host)
  IF p_bill_to IS NOT NULL THEN
    IF (p_bill_to ->> 'existing_id') IS NOT NULL THEN
      v_bill_to_id := (p_bill_to ->> 'existing_id')::uuid;
      SELECT type INTO v_bill_to_type FROM directory.entities WHERE id = v_bill_to_id;
    ELSIF (p_bill_to ->> 'type') IS NOT NULL THEN
      v_bill_to_type := p_bill_to ->> 'type';
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id, v_bill_to_type,
        COALESCE(p_bill_to ->> 'display_name', 'Bill to'),
        NULL,
        COALESCE(p_bill_to -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_bill_to_id;
    END IF;
  END IF;

  IF v_bill_to_id IS NULL THEN
    v_bill_to_id := v_primary_host_id;
    v_bill_to_type := v_primary_host_type;
  END IF;

  -- 8. Venue
  IF p_venue_entity IS NOT NULL AND (p_venue_entity ->> 'existing_id') IS NOT NULL THEN
    v_venue_id := (p_venue_entity ->> 'existing_id')::uuid;
  ELSIF p_venue_entity IS NOT NULL AND (p_venue_entity ->> 'display_name') IS NOT NULL THEN
    INSERT INTO directory.entities (owner_workspace_id, type, display_name, attributes)
    VALUES (
      p_workspace_id, 'venue',
      p_venue_entity ->> 'display_name',
      COALESCE(p_venue_entity -> 'attributes', '{"is_ghost": true, "category": "venue"}'::jsonb)
    )
    RETURNING id INTO v_venue_id;
  END IF;

  -- 9. Insert the deal
  v_org_id_for_deals := CASE
    WHEN v_bill_to_type = 'company' THEN v_bill_to_id
    WHEN v_primary_host_type = 'company' THEN v_primary_host_id
    ELSE NULL
  END;

  INSERT INTO public.deals (
    workspace_id,
    proposed_date,
    proposed_end_date,
    event_archetype,
    title,
    organization_id,
    main_contact_id,
    status,
    budget_estimated,
    notes,
    venue_id,
    lead_source,
    lead_source_id,
    lead_source_detail,
    referrer_entity_id,
    event_start_time,
    event_end_time
  )
  VALUES (
    p_workspace_id,
    CASE
      WHEN p_date_kind = 'series' THEN v_primary_date
      ELSE (p_deal ->> 'proposed_date')::date
    END,
    v_proposed_end_date,
    p_deal ->> 'event_archetype',
    NULLIF(TRIM(COALESCE(p_deal ->> 'title', '')), ''),
    v_org_id_for_deals,
    NULLIF(p_deal ->> 'main_contact_id', '')::uuid,
    COALESCE(p_deal ->> 'status', 'inquiry'),
    NULLIF(p_deal ->> 'budget_estimated', '')::numeric,
    NULLIF(TRIM(COALESCE(p_deal ->> 'notes', '')), ''),
    v_venue_id,
    NULLIF(p_deal ->> 'lead_source', ''),
    NULLIF(p_deal ->> 'lead_source_id', '')::uuid,
    NULLIF(TRIM(COALESCE(p_deal ->> 'lead_source_detail', '')), ''),
    NULLIF(p_deal ->> 'referrer_entity_id', '')::uuid,
    NULLIF(p_deal ->> 'event_start_time', ''),
    NULLIF(p_deal ->> 'event_end_time', '')
  )
  RETURNING id INTO v_deal_id;

  -- 10. Create ops.projects linked to the deal. Singletons and multi-day get
  --     is_series = false; series flip the flag + persist series_rule.
  --     Every deal gets a project so handoverDeal never has to lazily create
  --     one; promoting a singleton to a series later is a one-column flip.
  v_project_name := COALESCE(
    NULLIF(TRIM(COALESCE(p_deal ->> 'title', '')), ''),
    'Production'
  );

  INSERT INTO ops.projects (
    workspace_id, name, status,
    client_entity_id,
    deal_id,
    is_series, series_rule, series_archetype
  )
  VALUES (
    p_workspace_id, v_project_name, 'lead',
    v_bill_to_id,
    v_deal_id,
    p_date_kind = 'series',
    CASE WHEN p_date_kind = 'series' THEN v_series_rule ELSE NULL END,
    CASE WHEN p_date_kind = 'series' THEN v_series_archetype ELSE NULL END
  )
  RETURNING id INTO v_project_id;

  -- 11. Stakeholder rows (hosts, bill_to, poc, planner, venue_contact)
  FOR v_idx IN 1 .. array_length(v_host_ids, 1) LOOP
    INSERT INTO ops.deal_stakeholders (
      deal_id, organization_id, entity_id, role, is_primary, display_order
    )
    VALUES (
      v_deal_id,
      CASE WHEN v_host_types[v_idx] = 'company' THEN v_host_ids[v_idx] ELSE NULL END,
      CASE WHEN v_host_types[v_idx] = 'person'  THEN v_host_ids[v_idx] ELSE NULL END,
      'host'::public.deal_stakeholder_role,
      v_idx = 1,
      v_idx::smallint
    );
  END LOOP;

  INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
  VALUES (
    v_deal_id,
    CASE WHEN v_bill_to_type = 'company' THEN v_bill_to_id ELSE NULL END,
    CASE WHEN v_bill_to_type = 'person'  THEN v_bill_to_id ELSE NULL END,
    'bill_to'::public.deal_stakeholder_role,
    true
  )
  ON CONFLICT DO NOTHING;

  IF v_poc_id IS NOT NULL THEN
    DECLARE
      v_poc_type text;
    BEGIN
      SELECT type INTO v_poc_type FROM directory.entities WHERE id = v_poc_id;
      INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
      VALUES (
        v_deal_id,
        CASE WHEN v_poc_type = 'company' THEN v_poc_id ELSE NULL END,
        CASE WHEN v_poc_type = 'person'  THEN v_poc_id ELSE NULL END,
        'day_of_poc'::public.deal_stakeholder_role,
        false
      );
    END;
  END IF;

  IF v_planner_id IS NOT NULL THEN
    DECLARE
      v_planner_type text;
    BEGIN
      SELECT type INTO v_planner_type FROM directory.entities WHERE id = v_planner_id;
      INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
      VALUES (
        v_deal_id,
        CASE WHEN v_planner_type = 'company' THEN v_planner_id ELSE NULL END,
        CASE WHEN v_planner_type = 'person'  THEN v_planner_id ELSE NULL END,
        'planner'::public.deal_stakeholder_role,
        false
      )
      ON CONFLICT DO NOTHING;
    END;
  END IF;

  IF v_venue_id IS NOT NULL THEN
    INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
    VALUES (v_deal_id, v_venue_id, NULL, 'venue_contact'::public.deal_stakeholder_role, false)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 12. CO_HOST edges (unchanged from v2)
  IF array_length(v_host_ids, 1) >= 2 THEN
    v_a := v_host_ids[1];
    v_b := v_host_ids[2];
    v_a_type := v_host_types[1];
    v_b_type := v_host_types[2];
    IF v_a_type = 'person' AND v_b_type = 'person' THEN
      v_co_host_ctx := jsonb_build_object('pairing', p_pairing, 'anniversary_date', NULL);
      INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
      VALUES (v_a, v_b, 'CO_HOST', v_co_host_ctx)
      ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;
      INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
      VALUES (v_b, v_a, 'CO_HOST', v_co_host_ctx)
      ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;
    END IF;
  END IF;

  -- 13. Optional note (unchanged from v2)
  IF p_note IS NOT NULL AND (p_note ->> 'content') IS NOT NULL
     AND TRIM(p_note ->> 'content') <> '' THEN
    INSERT INTO ops.deal_notes (
      deal_id, workspace_id, author_user_id, content, attachments, phase_tag
    )
    VALUES (
      v_deal_id, p_workspace_id, v_user_id,
      TRIM(p_note ->> 'content'),
      '[]'::jsonb,
      COALESCE(NULLIF(p_note ->> 'phase_tag', ''), 'general')
    );
  END IF;

  RETURN jsonb_build_object(
    'deal_id', v_deal_id,
    'project_id', v_project_id,
    'host_entity_ids', to_jsonb(v_host_ids),
    'primary_host_entity_id', v_primary_host_id,
    'bill_to_entity_id', v_bill_to_id,
    'poc_entity_id', v_poc_id,
    'planner_entity_id', v_planner_id,
    'venue_entity_id', v_venue_id,
    'date_kind', p_date_kind,
    'is_series', p_date_kind = 'series'
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) IS
  'v3: adds p_date_kind (single|multi_day|series) + p_date (jsonb) and materializes an ops.projects row linked to the deal. Series create projects with is_series=true + series_rule. Events are materialized at handover, not here.';
