-- =============================================================================
-- create_deal_complete — atomic multi-step deal creation RPC
--
-- Rescan finding C4 + R2 research (Option 1: monolithic SECURITY DEFINER RPC).
-- Wraps the 7-step deal creation sequence in a single transaction so partial
-- failure is impossible:
--
--   1. Authn + workspace authz gate (auth.uid() + public.workspace_members)
--   2. Look up the workspace's primary "org" entity (for cortex edge source)
--   3. Create ghost client entity in directory.entities (person/couple/company)
--   4. Insert CLIENT cortex edge in cortex.relationships (inlined per R2 §5)
--   5. Optionally create ghost venue entity + VENUE_PARTNER cortex edge
--   6. Insert the deal row in public.deals
--   7. Insert auto-derived stakeholder rows in ops.deal_stakeholders
--   8. Insert optional note in ops.deal_notes
--
-- The old 5-sequential-insert flow in src/app/(dashboard)/(features)/crm/
-- actions/deal-actions.ts::createDeal had no transaction boundary. A failure
-- at step 4 (cortex edge), step 5 (deal), step 6 (stakeholders), or step 7
-- (notes) would leave orphan rows in earlier tables with no automatic cleanup.
-- C1/C3 Sentry instrumentation made the failures visible; this RPC makes
-- them impossible.
--
-- ── Design decisions ──────────────────────────────────────────────────────
--
-- • SECURITY DEFINER: the function runs as the owner (postgres) and bypasses
--   RLS on all 5 affected tables. Workspace isolation is enforced by the
--   explicit workspace_members check at the top — RLS is not a fallback.
--
-- • SET search_path = '': splinter rule 0011 compliance. Every identifier
--   is fully qualified: directory.entities, cortex.relationships, public.deals,
--   ops.deal_stakeholders, ops.deal_notes, public.deal_stakeholder_role, auth.uid().
--
-- • Cortex edges are INLINED rather than calling upsert_relationship per R2's
--   recommendation. Saves nested-function-call overhead, keeps everything in
--   one transaction body, and the inline workspace check is redundant with
--   the top-of-function workspace_members gate.
--
-- • Stakeholder rows are auto-derived inside the RPC (never passed in) so the
--   caller can't accidentally send a client_entity that doesn't match the
--   bill_to stakeholder row. Optional planner comes through p_stakeholder_extras.
--
-- • Returns jsonb `{deal_id, client_entity_id, venue_entity_id}` so callers
--   can redirect + revalidate without a follow-up SELECT.
--
-- • Grant posture: explicit REVOKE from PUBLIC/anon/authenticated (redundant
--   with PR 5's event trigger but explicit for clarity) + GRANT EXECUTE TO
--   authenticated (not service_role — server actions use the cookie-auth
--   client, which authenticates as the signed-in user).
--
-- ── Input shapes ──────────────────────────────────────────────────────────
--
-- p_client_entity:
--   {
--     "existing_id": "<uuid>" | null,  -- if set, skip create and use this entity
--     "type": "person" | "couple" | "company",
--     "display_name": "<text>",
--     "attributes": { ... }   -- full attributes jsonb (including is_ghost:true)
--   }
--
-- p_venue_entity:
--   null  -- or same shape as client (type implicit = 'venue')
--   {
--     "existing_id": "<uuid>" | null,
--     "display_name": "<text>",
--     "attributes": { ... }
--   }
--
-- p_deal:
--   {
--     "proposed_date": "YYYY-MM-DD",
--     "event_archetype": "<text>" | null,
--     "title": "<text>" | null,
--     "main_contact_id": "<uuid>" | null,
--     "status": "<text>",
--     "budget_estimated": <numeric> | null,
--     "notes": "<text>" | null,
--     "lead_source": "<text>" | null,
--     "lead_source_id": "<uuid>" | null,
--     "lead_source_detail": "<text>" | null,
--     "referrer_entity_id": "<uuid>" | null,
--     "event_start_time": "<text>" | null,  -- "HH:MM" stored as text
--     "event_end_time": "<text>" | null
--   }
--
-- p_stakeholder_extras:
--   null  -- or:
--   { "planner_entity_id": "<uuid>" | null }
--
-- p_note:
--   null  -- or:
--   { "content": "<text>", "phase_tag": "<text>" | null (default 'general') }
-- =============================================================================

CREATE OR REPLACE FUNCTION public.create_deal_complete(
  p_workspace_id uuid,
  p_client_entity jsonb,
  p_venue_entity jsonb,
  p_deal jsonb,
  p_stakeholder_extras jsonb DEFAULT NULL,
  p_note jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_workspace_org_id uuid;
  v_client_id uuid;
  v_venue_id uuid;
  v_deal_id uuid;
  v_planner_id uuid;
BEGIN
  -- 1. Authn gate
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'create_deal_complete: not authenticated'
      USING ERRCODE = '42501';
  END IF;

  -- 2. Workspace authz gate
  IF NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE user_id = v_user_id
      AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'create_deal_complete: caller is not a member of workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- 3. Look up workspace primary org entity for cortex edge source.
  -- NULL is fine — legacy workspaces may not have an org entity; in that case
  -- we skip the cortex edges (matching the current createDeal behavior).
  SELECT id INTO v_workspace_org_id
  FROM directory.entities
  WHERE owner_workspace_id = p_workspace_id
    AND type = 'company'
    AND (attributes->>'is_ghost' IS NULL OR attributes->>'is_ghost' <> 'true')
  LIMIT 1;

  -- 4. Resolve or create client entity
  IF p_client_entity IS NOT NULL AND (p_client_entity->>'existing_id') IS NOT NULL THEN
    v_client_id := (p_client_entity->>'existing_id')::uuid;
  ELSIF p_client_entity IS NOT NULL AND (p_client_entity->>'type') IS NOT NULL THEN
    INSERT INTO directory.entities (
      owner_workspace_id,
      type,
      display_name,
      claimed_by_user_id,
      attributes
    )
    VALUES (
      p_workspace_id,
      p_client_entity->>'type',
      COALESCE(p_client_entity->>'display_name', 'Client'),
      NULL,
      COALESCE(p_client_entity->'attributes', '{}'::jsonb)
    )
    RETURNING id INTO v_client_id;

    -- Inline CLIENT cortex edge (R2 §5: inline rather than nest upsert_relationship)
    IF v_workspace_org_id IS NOT NULL THEN
      INSERT INTO cortex.relationships (
        source_entity_id,
        target_entity_id,
        relationship_type,
        context_data
      )
      VALUES (
        v_workspace_org_id,
        v_client_id,
        'CLIENT',
        jsonb_build_object(
          'tier', 'preferred',
          'deleted_at', NULL,
          'lifecycle_status', 'active'
        )
      )
      ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
      DO UPDATE SET context_data = EXCLUDED.context_data;
    END IF;
  END IF;

  -- 5. Resolve or create venue entity (optional)
  IF p_venue_entity IS NOT NULL AND (p_venue_entity->>'existing_id') IS NOT NULL THEN
    v_venue_id := (p_venue_entity->>'existing_id')::uuid;
  ELSIF p_venue_entity IS NOT NULL AND (p_venue_entity->>'display_name') IS NOT NULL THEN
    INSERT INTO directory.entities (
      owner_workspace_id,
      type,
      display_name,
      attributes
    )
    VALUES (
      p_workspace_id,
      'venue',
      p_venue_entity->>'display_name',
      COALESCE(
        p_venue_entity->'attributes',
        '{"is_ghost": true, "category": "venue"}'::jsonb
      )
    )
    RETURNING id INTO v_venue_id;

    -- Inline VENUE_PARTNER cortex edge
    IF v_workspace_org_id IS NOT NULL THEN
      INSERT INTO cortex.relationships (
        source_entity_id,
        target_entity_id,
        relationship_type,
        context_data
      )
      VALUES (
        v_workspace_org_id,
        v_venue_id,
        'VENUE_PARTNER',
        jsonb_build_object(
          'tier', 'preferred',
          'deleted_at', NULL,
          'lifecycle_status', 'active'
        )
      )
      ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
      DO UPDATE SET context_data = EXCLUDED.context_data;
    END IF;
  END IF;

  -- 6. Insert the deal row
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
    (p_deal->>'proposed_date')::date,
    p_deal->>'event_archetype',
    NULLIF(TRIM(COALESCE(p_deal->>'title', '')), ''),
    v_client_id,
    NULLIF(p_deal->>'main_contact_id', '')::uuid,
    COALESCE(p_deal->>'status', 'inquiry'),
    NULLIF(p_deal->>'budget_estimated', '')::numeric,
    NULLIF(TRIM(COALESCE(p_deal->>'notes', '')), ''),
    v_venue_id,
    NULLIF(p_deal->>'lead_source', ''),
    NULLIF(p_deal->>'lead_source_id', '')::uuid,
    NULLIF(TRIM(COALESCE(p_deal->>'lead_source_detail', '')), ''),
    NULLIF(p_deal->>'referrer_entity_id', '')::uuid,
    NULLIF(p_deal->>'event_start_time', ''),
    NULLIF(p_deal->>'event_end_time', '')
  )
  RETURNING id INTO v_deal_id;

  -- 7. Auto-derive stakeholder rows (bill_to + venue_contact + optional planner)
  IF v_client_id IS NOT NULL THEN
    INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
    VALUES (v_deal_id, v_client_id, NULL, 'bill_to'::public.deal_stakeholder_role, true);
  END IF;

  IF v_venue_id IS NOT NULL THEN
    INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
    VALUES (v_deal_id, v_venue_id, NULL, 'venue_contact'::public.deal_stakeholder_role, false);
  END IF;

  IF p_stakeholder_extras IS NOT NULL
     AND (p_stakeholder_extras->>'planner_entity_id') IS NOT NULL THEN
    v_planner_id := (p_stakeholder_extras->>'planner_entity_id')::uuid;
    INSERT INTO ops.deal_stakeholders (deal_id, organization_id, entity_id, role, is_primary)
    VALUES (v_deal_id, v_planner_id, NULL, 'planner'::public.deal_stakeholder_role, false);
  END IF;

  -- 8. Insert optional seed note. author_user_id comes from auth.uid(),
  -- never from the caller payload — prevents spoofing the author field.
  IF p_note IS NOT NULL AND (p_note->>'content') IS NOT NULL
     AND TRIM(p_note->>'content') <> '' THEN
    INSERT INTO ops.deal_notes (
      deal_id,
      workspace_id,
      author_user_id,
      content,
      attachments,
      phase_tag
    )
    VALUES (
      v_deal_id,
      p_workspace_id,
      v_user_id,
      TRIM(p_note->>'content'),
      '[]'::jsonb,
      COALESCE(NULLIF(p_note->>'phase_tag', ''), 'general')
    );
  END IF;

  RETURN jsonb_build_object(
    'deal_id', v_deal_id,
    'client_entity_id', v_client_id,
    'venue_entity_id', v_venue_id
  );
END;
$function$;

-- Explicit grant posture (redundant with PR 5's event trigger but explicit for clarity)
REVOKE ALL ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.create_deal_complete(uuid, jsonb, jsonb, jsonb, jsonb, jsonb) IS
  'Atomic multi-step deal creation. Replaces the 7 sequential inserts in createDeal server action with a single transaction-safe RPC. Partial failure rolls back all inserts. See supabase/migrations/20260411210000_create_deal_complete_rpc.sql for full input/output contract and rescan finding C4 for motivation.';
