-- =============================================================================
-- Fix: create_deal_complete duplicates a host's directory.entities row when the
-- same person is also passed as p_poc / p_planner / p_bill_to.
--
-- Symptom: Daniel created "Bryan & Jessica Wedding" with Bryan as Partner A and
-- as the day-of POC. Two directory.entities rows for "Bryan Fullam" got
-- created — one for the host, one for the POC — and the deal-header strip
-- rendered Bryan twice (the UI dedupe in people-strip.tsx keys on entity_id,
-- so name-only collisions slip through).
--
-- Root cause: the RPC processed p_hosts, p_poc, p_planner, p_bill_to as
-- independent INSERT-into-directory.entities paths. Only p_bill_to had an
-- explicit "fall back to primary host" branch (`IF v_bill_to_id IS NULL …`).
-- POC and planner had no equivalent. Client side (deal-actions.ts) was passing
-- the duplicate shape and assuming the RPC would dedupe. It didn't.
--
-- This migration rebuilds resolution for the three role payloads as a
-- 4-step precedence ladder (additive — same signature, same return shape):
--
--   1. existing_id            → use it (today's behavior, unchanged)
--   2. from_host_index (NEW)  → reuse v_host_ids[idx] / v_host_types[idx]
--   3. content-shape match    → if person-shape signature equals one of the
--                               resolved hosts' signatures, reuse that host id
--   4. type set, no match     → INSERT new directory.entities row (today)
--
-- Signature for content match (person-only):
--   (lower(trim(first_name)),
--    lower(trim(last_name)),
--    nullif(lower(trim(email)), ''))
-- Two NULL emails count as equal — first+last alone is sufficient when neither
-- side has an email. Companies match on lower(trim(display_name)). Step 3 is a
-- defensive backstop: callers that forget step 2 don't silently re-introduce
-- the bug.
--
-- p_bill_to keeps its existing "fall back to primary host" behavior at the
-- bottom of the block — unchanged.
--
-- The signature (uuid, jsonb×7, text, text, jsonb) is unchanged, so all
-- existing call sites (only deal-actions.ts hits this) continue to work
-- without changes. The from_host_index field rides inside the existing
-- p_poc / p_planner / p_bill_to JSONB envelope.
-- =============================================================================

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
  -- Normalized signatures parallel to v_host_ids — used by step 3 of the
  -- POC / planner / bill_to precedence ladder. Person hosts get a
  -- "p|first|last|email" string; company hosts get "c|name". One slot per
  -- host, in the same order as v_host_ids.
  v_host_sigs text[] := ARRAY[]::text[];
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
  v_workspace_org_id uuid;
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
  v_role_sig text;
  v_role_match_idx int;
  v_role_first text;
  v_role_last text;
  v_role_email text;
  v_role_name text;
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

  -- 4. Resolve / create host entities + capture their normalized signatures
  --    in a parallel array. Signatures are used by the role-resolution
  --    backstop below to detect "this POC/planner/bill_to is shape-equal to
  --    one of the hosts" and reuse that entity instead of inserting a
  --    duplicate.
  FOR v_idx IN 0 .. jsonb_array_length(p_hosts) - 1 LOOP
    v_host_shape := p_hosts -> v_idx;

    IF v_host_shape ? 'existing_id' AND (v_host_shape ->> 'existing_id') IS NOT NULL THEN
      v_resolved_id := (v_host_shape ->> 'existing_id')::uuid;
      SELECT type, COALESCE(display_name, ''),
             COALESCE(attributes ->> 'first_name', ''),
             COALESCE(attributes ->> 'last_name', ''),
             COALESCE(attributes ->> 'email', '')
      INTO v_resolved_type, v_role_name, v_role_first, v_role_last, v_role_email
      FROM directory.entities WHERE id = v_resolved_id;
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
      v_role_name  := COALESCE(v_host_shape ->> 'display_name', '');
      v_role_first := COALESCE(v_host_shape -> 'attributes' ->> 'first_name', '');
      v_role_last  := COALESCE(v_host_shape -> 'attributes' ->> 'last_name', '');
      v_role_email := COALESCE(v_host_shape -> 'attributes' ->> 'email', '');
    ELSE
      RAISE EXCEPTION 'create_deal_complete: host shape missing both existing_id and type' USING ERRCODE = '22023';
    END IF;

    v_host_ids := array_append(v_host_ids, v_resolved_id);
    v_host_types := array_append(v_host_types, v_resolved_type);

    IF v_resolved_type = 'person' THEN
      v_host_sigs := array_append(
        v_host_sigs,
        'p|'
          || lower(btrim(v_role_first)) || '|'
          || lower(btrim(v_role_last))  || '|'
          || lower(btrim(v_role_email))
      );
    ELSE
      v_host_sigs := array_append(
        v_host_sigs,
        'c|' || lower(btrim(v_role_name))
      );
    END IF;
  END LOOP;

  v_primary_host_id := v_host_ids[1];
  v_primary_host_type := v_host_types[1];

  -- 5. POC (optional) — 4-step precedence ladder
  IF p_poc IS NOT NULL THEN
    IF (p_poc ->> 'existing_id') IS NOT NULL THEN
      -- Step 1: explicit existing_id wins.
      v_poc_id := (p_poc ->> 'existing_id')::uuid;
    ELSIF (p_poc ->> 'from_host_index') IS NOT NULL THEN
      -- Step 2: from_host_index (1-based) — reuse the resolved host entity.
      v_idx := (p_poc ->> 'from_host_index')::int;
      IF v_idx < 1 OR v_idx > array_length(v_host_ids, 1) THEN
        RAISE EXCEPTION 'create_deal_complete: p_poc.from_host_index % out of range', v_idx USING ERRCODE = '22023';
      END IF;
      v_poc_id := v_host_ids[v_idx];
    ELSIF (p_poc ->> 'type') IS NOT NULL THEN
      -- Step 3: content-shape backstop. Compute the signature from the
      -- payload and compare against the host signatures captured above.
      IF (p_poc ->> 'type') = 'person' THEN
        v_role_sig :=
          'p|'
            || lower(btrim(COALESCE(p_poc -> 'attributes' ->> 'first_name', ''))) || '|'
            || lower(btrim(COALESCE(p_poc -> 'attributes' ->> 'last_name',  ''))) || '|'
            || lower(btrim(COALESCE(p_poc -> 'attributes' ->> 'email',      '')));
      ELSE
        v_role_sig :=
          'c|' || lower(btrim(COALESCE(p_poc ->> 'display_name', '')));
      END IF;

      v_role_match_idx := NULL;
      FOR v_idx IN 1 .. array_length(v_host_sigs, 1) LOOP
        IF v_host_sigs[v_idx] = v_role_sig THEN
          v_role_match_idx := v_idx;
          EXIT;
        END IF;
      END LOOP;

      IF v_role_match_idx IS NOT NULL THEN
        v_poc_id := v_host_ids[v_role_match_idx];
      ELSE
        -- Step 4: no match — INSERT new entity (today's behavior).
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
  END IF;

  -- 6. Planner (optional) — same 4-step precedence ladder as POC
  IF p_planner IS NOT NULL THEN
    IF (p_planner ->> 'existing_id') IS NOT NULL THEN
      v_planner_id := (p_planner ->> 'existing_id')::uuid;
    ELSIF (p_planner ->> 'from_host_index') IS NOT NULL THEN
      v_idx := (p_planner ->> 'from_host_index')::int;
      IF v_idx < 1 OR v_idx > array_length(v_host_ids, 1) THEN
        RAISE EXCEPTION 'create_deal_complete: p_planner.from_host_index % out of range', v_idx USING ERRCODE = '22023';
      END IF;
      v_planner_id := v_host_ids[v_idx];
    ELSIF (p_planner ->> 'type') IS NOT NULL THEN
      IF (p_planner ->> 'type') = 'person' THEN
        v_role_sig :=
          'p|'
            || lower(btrim(COALESCE(p_planner -> 'attributes' ->> 'first_name', ''))) || '|'
            || lower(btrim(COALESCE(p_planner -> 'attributes' ->> 'last_name',  ''))) || '|'
            || lower(btrim(COALESCE(p_planner -> 'attributes' ->> 'email',      '')));
      ELSE
        v_role_sig :=
          'c|' || lower(btrim(COALESCE(p_planner ->> 'display_name', '')));
      END IF;

      v_role_match_idx := NULL;
      FOR v_idx IN 1 .. array_length(v_host_sigs, 1) LOOP
        IF v_host_sigs[v_idx] = v_role_sig THEN
          v_role_match_idx := v_idx;
          EXIT;
        END IF;
      END LOOP;

      IF v_role_match_idx IS NOT NULL THEN
        v_planner_id := v_host_ids[v_role_match_idx];
      ELSE
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
  END IF;

  -- 7. Bill-to — same 4-step precedence ladder, then fall back to primary host
  --    when nothing was provided (existing behavior preserved).
  IF p_bill_to IS NOT NULL THEN
    IF (p_bill_to ->> 'existing_id') IS NOT NULL THEN
      v_bill_to_id := (p_bill_to ->> 'existing_id')::uuid;
      SELECT type INTO v_bill_to_type FROM directory.entities WHERE id = v_bill_to_id;
    ELSIF (p_bill_to ->> 'from_host_index') IS NOT NULL THEN
      v_idx := (p_bill_to ->> 'from_host_index')::int;
      IF v_idx < 1 OR v_idx > array_length(v_host_ids, 1) THEN
        RAISE EXCEPTION 'create_deal_complete: p_bill_to.from_host_index % out of range', v_idx USING ERRCODE = '22023';
      END IF;
      v_bill_to_id := v_host_ids[v_idx];
      v_bill_to_type := v_host_types[v_idx];
    ELSIF (p_bill_to ->> 'type') IS NOT NULL THEN
      IF (p_bill_to ->> 'type') = 'person' THEN
        v_role_sig :=
          'p|'
            || lower(btrim(COALESCE(p_bill_to -> 'attributes' ->> 'first_name', ''))) || '|'
            || lower(btrim(COALESCE(p_bill_to -> 'attributes' ->> 'last_name',  ''))) || '|'
            || lower(btrim(COALESCE(p_bill_to -> 'attributes' ->> 'email',      '')));
      ELSE
        v_role_sig :=
          'c|' || lower(btrim(COALESCE(p_bill_to ->> 'display_name', '')));
      END IF;

      v_role_match_idx := NULL;
      FOR v_idx IN 1 .. array_length(v_host_sigs, 1) LOOP
        IF v_host_sigs[v_idx] = v_role_sig THEN
          v_role_match_idx := v_idx;
          EXIT;
        END IF;
      END LOOP;

      IF v_role_match_idx IS NOT NULL THEN
        v_bill_to_id := v_host_ids[v_role_match_idx];
        v_bill_to_type := v_host_types[v_role_match_idx];
      ELSE
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

  -- 12. CO_HOST edges
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

  -- 12b. CLIENT edges from workspace org entity → each host *person*.
  SELECT id INTO v_workspace_org_id
  FROM directory.entities
  WHERE owner_workspace_id = p_workspace_id
    AND type = 'company'
    AND (attributes->>'is_ghost' IS NULL OR attributes->>'is_ghost' <> 'true')
  LIMIT 1;

  IF v_workspace_org_id IS NOT NULL THEN
    FOR v_idx IN 1 .. array_length(v_host_ids, 1) LOOP
      IF v_host_types[v_idx] = 'person' THEN
        INSERT INTO cortex.relationships (
          source_entity_id, target_entity_id, relationship_type, context_data
        )
        VALUES (
          v_workspace_org_id,
          v_host_ids[v_idx],
          'CLIENT',
          jsonb_build_object(
            'tier', 'preferred',
            'introduced_via_deal_id', v_deal_id
          )
        )
        ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;
      END IF;
    END LOOP;
  END IF;

  -- 13. Optional note
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

-- Per the [Postgres function grants default to PUBLIC] memory: explicit
-- REVOKE + targeted GRANT after every CREATE OR REPLACE on a SECURITY
-- DEFINER function. CREATE OR REPLACE preserves prior grants; we re-emit
-- them here so the migration is self-describing and an audit of
-- has_function_privilege('anon', oid, 'EXECUTE') can be pinned to this file.
REVOKE ALL ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text, text, jsonb) IS
  'v3.2: v3.1 + dedupe host references for p_poc / p_planner / p_bill_to. Each role payload now resolves through a 4-step ladder (existing_id > from_host_index > content-shape match > insert new) so a host who is also the POC/planner/bill_to does not get a second directory.entities row. Fixes the duplicate-Bryan symptom in the deal-header strip.';
