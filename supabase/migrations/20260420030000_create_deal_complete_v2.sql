-- =============================================================================
-- Client-field redesign P0 — Step 4: rewrite create_deal_complete.
--
-- The pre-P0 RPC accepted a single `p_client_entity` jsonb representing one
-- of {company, individual, couple}. The new model treats the show as having a
-- *cast* of named stakeholders:
--   - One or more HOSTS (the named clients)
--   - Optional day-of point of contact (POC), distinct from "the host"
--   - Optional bill-to (defaults to primary host)
--   - Optional planner (independent of POC — a wedding can have a planner who
--     is NOT the day-of POC, e.g. when the couple themselves is the POC)
--
-- New contract:
--
--   p_workspace_id  uuid
--   p_hosts         jsonb     -- array of host shapes (1+ rows). First = primary.
--   p_poc           jsonb     -- optional POC shape; sets day_of_poc role.
--   p_bill_to       jsonb     -- optional bill-to shape; defaults to primary host.
--   p_planner       jsonb     -- optional planner shape (separate from POC).
--   p_venue_entity  jsonb     -- existing shape, unchanged.
--   p_deal          jsonb     -- existing shape, unchanged.
--   p_note          jsonb     -- existing shape, unchanged.
--
-- Each shape is one of:
--   { "existing_id": "<uuid>" }                                  — reuse existing entity
--   { "type": "person" | "company", "display_name": "...",
--     "attributes": { ... } }                                    — create ghost
--
-- Hosts processing rules:
--   1. Each host shape resolves to a directory.entities id (created if needed).
--   2. The first host is flagged is_primary=true with role=host.
--   3. Subsequent hosts get role=host, is_primary=false. display_order tracks
--      array index (1, 2, 3...).
--   4. If 2+ host *person* shapes are passed AND p_pairing is supplied
--      (defaulting to 'romantic') the RPC writes a CO_HOST directed-pair
--      edge between the first two host persons. Multi-partner CO_HOSTs
--      beyond two are not auto-edged in P0.
--
-- POC processing rules:
--   - If p_poc is null, no day_of_poc row is created.
--   - If p_poc.existing_id matches a host's resolved entity, the POC reuses
--     that entity (no duplicate ghost) and we write a SECOND stakeholder row
--     with role=day_of_poc, is_primary=false. The new role-aware unique index
--     (deal_id, entity_id, role) allows this.
--   - If p_poc is a fresh shape, the RPC creates the ghost entity and writes
--     a day_of_poc stakeholder row.
--
-- Planner processing rules:
--   - Independent of POC. Same dedup logic: if planner.existing_id matches an
--     already-resolved entity (host or POC), reuse it; write a planner row.
--
-- Bill-to processing rules:
--   - If p_bill_to is null, defaults to the primary host's resolved entity.
--   - Always written as a stakeholder row with role=bill_to, is_primary=true.
--   - The legacy `public.deals.organization_id` denormalization is set to the
--     bill-to's entity id when the bill-to is a company, or null when person.
--     `client_entity_id` mirrors the primary host (kept in sync for the
--     existing ops.events / ops.projects denorm chain).
--
-- bill_to is required (NOT NULL on finance.invoices.bill_to_entity_id) — the
-- RPC always writes a value, defaulting to the primary host. The Phase 1
-- resolution layer will let workspaces re-route this without breaking the
-- contract (Critic finding S5).
--
-- Atomic: any failure rolls back the whole transaction. Replaces the prior
-- 7-sequential-insert flow.
--
-- Depends on:
--   - 20260420000000_deal_stakeholder_role_add_p0_values.sql (host, day_of_poc roles)
--   - 20260420010000_deal_stakeholders_p0_constraints.sql (role-aware uniques)
--   - 20260420020000_co_host_represents_edge_rpcs.sql (CO_HOST edge convention)
-- =============================================================================

-- Drop the pre-P0 signature explicitly. The new function has different
-- parameter names + arity, so it would otherwise live alongside the old one,
-- and `supabase.rpc('create_deal_complete', ...)` would resolve ambiguously.
DROP FUNCTION IF EXISTS public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.create_deal_complete(
  p_workspace_id uuid,
  p_hosts jsonb,
  p_poc jsonb DEFAULT NULL,
  p_bill_to jsonb DEFAULT NULL,
  p_planner jsonb DEFAULT NULL,
  p_venue_entity jsonb DEFAULT NULL,
  p_deal jsonb DEFAULT '{}'::jsonb,
  p_note jsonb DEFAULT NULL,
  p_pairing text DEFAULT 'romantic'
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
  v_org_id_for_deals uuid;
  v_idx int;
  v_a uuid;
  v_b uuid;
  v_a_type text;
  v_b_type text;
  v_co_host_ctx jsonb;
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

  -- 2. Hosts: must have at least one
  IF p_hosts IS NULL OR jsonb_typeof(p_hosts) <> 'array' OR jsonb_array_length(p_hosts) = 0 THEN
    RAISE EXCEPTION 'create_deal_complete: p_hosts must be a non-empty jsonb array' USING ERRCODE = '22023';
  END IF;

  IF p_pairing NOT IN ('romantic', 'co_host', 'family') THEN
    RAISE EXCEPTION 'create_deal_complete: invalid pairing %', p_pairing USING ERRCODE = '22023';
  END IF;

  -- 3. Resolve / create each host entity, accumulating ids in array order.
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
        p_workspace_id,
        v_resolved_type,
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

  -- 4. Resolve POC (if provided)
  IF p_poc IS NOT NULL THEN
    IF (p_poc ->> 'existing_id') IS NOT NULL THEN
      v_poc_id := (p_poc ->> 'existing_id')::uuid;
    ELSIF (p_poc ->> 'type') IS NOT NULL THEN
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id,
        p_poc ->> 'type',
        COALESCE(p_poc ->> 'display_name', 'Point of contact'),
        NULL,
        COALESCE(p_poc -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_poc_id;
    END IF;
  END IF;

  -- 5. Resolve planner (if provided). Independent of POC.
  IF p_planner IS NOT NULL THEN
    IF (p_planner ->> 'existing_id') IS NOT NULL THEN
      v_planner_id := (p_planner ->> 'existing_id')::uuid;
    ELSIF (p_planner ->> 'type') IS NOT NULL THEN
      INSERT INTO directory.entities (
        owner_workspace_id, type, display_name, claimed_by_user_id, attributes
      )
      VALUES (
        p_workspace_id,
        p_planner ->> 'type',
        COALESCE(p_planner ->> 'display_name', 'Planner'),
        NULL,
        COALESCE(p_planner -> 'attributes', '{}'::jsonb)
      )
      RETURNING id INTO v_planner_id;
    END IF;
  END IF;

  -- 6. Resolve bill_to. Default to primary host if not supplied.
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
        p_workspace_id,
        v_bill_to_type,
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

  -- 7. Resolve venue (existing logic)
  IF p_venue_entity IS NOT NULL AND (p_venue_entity ->> 'existing_id') IS NOT NULL THEN
    v_venue_id := (p_venue_entity ->> 'existing_id')::uuid;
  ELSIF p_venue_entity IS NOT NULL AND (p_venue_entity ->> 'display_name') IS NOT NULL THEN
    INSERT INTO directory.entities (owner_workspace_id, type, display_name, attributes)
    VALUES (
      p_workspace_id,
      'venue',
      p_venue_entity ->> 'display_name',
      COALESCE(p_venue_entity -> 'attributes', '{"is_ghost": true, "category": "venue"}'::jsonb)
    )
    RETURNING id INTO v_venue_id;
  END IF;

  -- 8. Insert the deal row.
  -- legacy organization_id: use bill_to entity id when bill_to is a company,
  -- otherwise the primary host entity id when it is a company; else NULL.
  -- The CRM stream cards / handover pipeline still read this column.
  v_org_id_for_deals := CASE
    WHEN v_bill_to_type = 'company' THEN v_bill_to_id
    WHEN v_primary_host_type = 'company' THEN v_primary_host_id
    ELSE NULL
  END;

  INSERT INTO public.deals (
    workspace_id,
    proposed_date,
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
    (p_deal ->> 'proposed_date')::date,
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

  -- 9. Stakeholder rows.
  --    - One host row per host id, first is_primary=true, display_order = idx+1
  --    - Bill-to row (default = primary host's entity, or whatever was passed)
  --    - day_of_poc row when v_poc_id resolved
  --    - planner row when v_planner_id resolved
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

  -- bill_to row.
  INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
  VALUES (
    v_deal_id,
    CASE WHEN v_bill_to_type = 'company' THEN v_bill_to_id ELSE NULL END,
    CASE WHEN v_bill_to_type = 'person'  THEN v_bill_to_id ELSE NULL END,
    'bill_to'::public.deal_stakeholder_role,
    true
  )
  ON CONFLICT DO NOTHING;  -- if bill_to == primary host AND host row already covers it, no harm

  -- day_of_poc row.
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

  -- planner row.
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

  -- venue_contact row (existing convention).
  IF v_venue_id IS NOT NULL THEN
    INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
    VALUES (v_deal_id, v_venue_id, NULL, 'venue_contact'::public.deal_stakeholder_role, false)
    ON CONFLICT DO NOTHING;
  END IF;

  -- 10. CO_HOST edges. Only when 2+ host *persons* are in the array.
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

  -- 11. Optional seed note.
  IF p_note IS NOT NULL AND (p_note ->> 'content') IS NOT NULL
     AND TRIM(p_note ->> 'content') <> '' THEN
    INSERT INTO ops.deal_notes (
      deal_id, workspace_id, author_user_id, content, attachments, phase_tag
    )
    VALUES (
      v_deal_id,
      p_workspace_id,
      v_user_id,
      TRIM(p_note ->> 'content'),
      '[]'::jsonb,
      COALESCE(NULLIF(p_note ->> 'phase_tag', ''), 'general')
    );
  END IF;

  RETURN jsonb_build_object(
    'deal_id', v_deal_id,
    'host_entity_ids', to_jsonb(v_host_ids),
    'primary_host_entity_id', v_primary_host_id,
    'bill_to_entity_id', v_bill_to_id,
    'poc_entity_id', v_poc_id,
    'planner_entity_id', v_planner_id,
    'venue_entity_id', v_venue_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) TO authenticated;

COMMENT ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, text) IS
  'P0 client-field redesign. Atomic deal creation with cast-of-stakeholders contract: hosts[], optional poc, bill_to, planner, venue. Auto-derives stakeholder rows + CO_HOST edges for romantic/co_host/family pairings. See migration 20260420030000_create_deal_complete_v2.sql for the full input/output contract.';
