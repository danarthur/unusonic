-- Phase 2.1 fix — feasibility_check_for_deal counts preferred + in_house as one pool.
--
-- Background: M5 (20260427064453_role_pool_count_edgeless_workspace_persons)
-- relaxed get_role_pool to surface workspace-owned ghost persons (no
-- ROSTER_MEMBER edge) under the `preferred` bucket. But the conflict-generating
-- consumer ops.feasibility_check_for_deal still keyed off `in_house_total`
-- alone — so a workspace with two DJs tagged via the network entity page
-- (which writes to ops.crew_skills only, no edge) still surfaced
-- "DJ — not set up" with severity high, even though the data shows the
-- workspace clearly HAS those people.
--
-- Fix: the conflict generator now uses a combined pool (in_house + preferred):
--   r_total     = in_house_total     + preferred_total
--   r_available = in_house_available + preferred_total
--
-- Preferred has no day-of commitment tracking yet, so we treat them as
-- nominally available — the owner does the manual check. This matches the
-- M5 migration's intent and stops "not set up" from misrepresenting reality.
-- The downstream conflict states (empty / exhausted / tight / at_risk)
-- now reflect the real workspace pool regardless of edge classification.

CREATE OR REPLACE FUNCTION ops.feasibility_check_for_deal(p_deal_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
DECLARE
  v_workspace_id   uuid;
  v_proposed_date  date;
  v_archetype_slug text;
  v_pools          jsonb;
  v_confirmed      jsonb;
  v_open_deals     jsonb;
  v_blackouts      jsonb;
  v_adjacent       jsonb;
  v_soft_load      jsonb;
  v_state_map      jsonb := '{}'::jsonb;
  v_conflicts      jsonb := '[]'::jsonb;
  v_days_to_event  int;
  v_pool           jsonb;
  v_show           jsonb;
  v_deal           jsonb;
  v_blackout       jsonb;
  v_adj            jsonb;
  v_item_key       text;
  v_state_row      jsonb;
BEGIN
  SELECT d.workspace_id, d.proposed_date, d.event_archetype
  INTO   v_workspace_id, v_proposed_date, v_archetype_slug
  FROM   public.deals d
  WHERE  d.id = p_deal_id
    AND  d.archived_at IS NULL;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'deal not found or archived: %', p_deal_id
      USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', v_workspace_id
      USING ERRCODE = '42501';
  END IF;

  IF v_proposed_date IS NOT NULL THEN
    v_days_to_event := (v_proposed_date - CURRENT_DATE);
  END IF;

  SELECT COALESCE(
    jsonb_object_agg(
      item_key,
      jsonb_build_object(
        'state',    state,
        'ack_note', ack_note,
        'acted_by', acted_by,
        'acted_at', acted_at
      )
    ),
    '{}'::jsonb
  )
  INTO v_state_map
  FROM ops.deal_open_items
  WHERE deal_id = p_deal_id;

  IF v_proposed_date IS NOT NULL THEN
    v_confirmed  := ops._feasibility_confirmed_shows(v_workspace_id, v_proposed_date);
    v_open_deals := ops._feasibility_open_deals(v_workspace_id, v_proposed_date, p_deal_id);
    v_blackouts  := ops._feasibility_recurring_blackouts(v_workspace_id, v_proposed_date);
    v_adjacent   := ops._feasibility_adjacent_events(v_workspace_id, v_proposed_date);
    v_soft_load  := ops._feasibility_soft_load(v_workspace_id, v_proposed_date);
  ELSE
    v_confirmed  := '[]'::jsonb;
    v_open_deals := '[]'::jsonb;
    v_blackouts  := '[]'::jsonb;
    v_adjacent   := '[]'::jsonb;
    v_soft_load  := jsonb_build_object('confirmed_in_72h', 0, 'deals_in_72h', 0, 'is_heavy', false);
  END IF;

  IF v_archetype_slug IS NOT NULL AND v_archetype_slug <> '' THEN
    v_pools := COALESCE(
      (ops.get_role_pools_for_archetype(v_workspace_id, v_archetype_slug, v_proposed_date))->'pools',
      '[]'::jsonb
    );
  ELSE
    v_pools := COALESCE(
      (ops.get_role_pools_summary(v_workspace_id, v_proposed_date))->'pools',
      '[]'::jsonb
    );
  END IF;

  FOR v_show IN SELECT * FROM jsonb_array_elements(v_confirmed)
  LOOP
    v_item_key  := 'conflict/event/' || (v_show->>'id');
    v_state_row := v_state_map->v_item_key;
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'item_key',      v_item_key,
      'dimension',     'scope',
      'severity',      'high',
      'state',         COALESCE(v_state_row->>'state', 'open'),
      'title',         'Booked — ' || (v_show->>'title'),
      'subtitle',      'Confirmed show on this date',
      'ack_note',      v_state_row->>'ack_note',
      'ack_by',        v_state_row->>'acted_by',
      'ack_at',        v_state_row->>'acted_at',
      'days_to_event', v_days_to_event,
      'payload',       v_show
    ));
  END LOOP;

  FOR v_deal IN SELECT * FROM jsonb_array_elements(v_open_deals)
  LOOP
    v_item_key  := 'conflict/deal/' || (v_deal->>'id');
    v_state_row := v_state_map->v_item_key;
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'item_key',      v_item_key,
      'dimension',     'scope',
      'severity',      CASE WHEN (v_deal->>'is_committed')::boolean THEN 'high' ELSE 'medium' END,
      'state',         COALESCE(v_state_row->>'state', 'open'),
      'title',         CASE
                         WHEN (v_deal->>'is_committed')::boolean
                           THEN 'Booked — ' || (v_deal->>'title')
                         ELSE 'Open deal — ' || (v_deal->>'title')
                       END,
      'subtitle',      COALESCE(v_deal->>'stage_label', 'Pre-handoff'),
      'ack_note',      v_state_row->>'ack_note',
      'ack_by',        v_state_row->>'acted_by',
      'ack_at',        v_state_row->>'acted_at',
      'days_to_event', v_days_to_event,
      'payload',       v_deal
    ));
  END LOOP;

  FOR v_blackout IN SELECT * FROM jsonb_array_elements(v_blackouts)
  LOOP
    v_item_key  := 'conflict/blackout/' || (v_blackout->>'entity_id') || '/' || (v_blackout->>'range_start');
    v_state_row := v_state_map->v_item_key;
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'item_key',      v_item_key,
      'dimension',     'crew',
      'severity',      'medium',
      'state',         COALESCE(v_state_row->>'state', 'open'),
      'title',         'Crew unavailable — ' || (v_blackout->>'entity_name'),
      'subtitle',      'Self-reported blackout',
      'ack_note',      v_state_row->>'ack_note',
      'ack_by',        v_state_row->>'acted_by',
      'ack_at',        v_state_row->>'acted_at',
      'days_to_event', v_days_to_event,
      'payload',       v_blackout
    ));
  END LOOP;

  FOR v_adj IN SELECT * FROM jsonb_array_elements(v_adjacent)
  LOOP
    v_item_key  := 'adjacent/event/' || (v_adj->>'id');
    v_state_row := v_state_map->v_item_key;
    v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
      'item_key',      v_item_key,
      'dimension',     'travel',
      'severity',      'medium',
      'state',         COALESCE(v_state_row->>'state', 'open'),
      'title',         'Adjacent commitment — ' || (v_adj->>'title'),
      'subtitle',      CASE
                         WHEN (v_adj->>'side') = 'before' THEN 'Day before · check load-in window'
                         WHEN (v_adj->>'side') = 'after'  THEN 'Day after · check strike window'
                         ELSE 'Overlapping commitment'
                       END,
      'ack_note',      v_state_row->>'ack_note',
      'ack_by',        v_state_row->>'acted_by',
      'ack_at',        v_state_row->>'acted_at',
      'days_to_event', v_days_to_event,
      'payload',       v_adj
    ));
  END LOOP;

  IF v_archetype_slug IS NOT NULL AND v_archetype_slug <> '' THEN
    FOR v_pool IN SELECT * FROM jsonb_array_elements(v_pools)
    LOOP
      DECLARE
        r_role            text    := v_pool->>'role_tag';
        r_required        boolean := NOT COALESCE((v_pool->>'is_optional')::boolean, true);
        r_qty             int     := COALESCE((v_pool->>'qty_required')::int, 1);
        -- Combined pool: every workspace-owned person tagged with this role,
        -- whether ROSTER_MEMBER edged (in_house) or edge-less ghost (preferred).
        -- Preferred has no day-of commitment tracking yet, so we treat them as
        -- nominally available — owner does the manual check. This matches the
        -- M5 migration's intent (count edge-less ghosts) and stops "not set up"
        -- from firing when the workspace clearly HAS people tagged for the role.
        r_total           int     := COALESCE((v_pool->>'in_house_total')::int, 0)
                                   + COALESCE((v_pool->>'preferred_total')::int, 0);
        r_available       int     := COALESCE((v_pool->>'in_house_available')::int, 0)
                                   + COALESCE((v_pool->>'preferred_total')::int, 0);
      BEGIN
        IF r_required AND r_total = 0 THEN
          v_item_key  := 'crew/role/' || r_role || '/empty';
          v_state_row := v_state_map->v_item_key;
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'item_key',      v_item_key,
            'dimension',     'crew',
            'severity',      'high',
            'state',         COALESCE(v_state_row->>'state', 'open'),
            'title',         r_role || ' — not set up',
            'subtitle',      'No one in your workspace is tagged for this role',
            'ack_note',      v_state_row->>'ack_note',
            'ack_by',        v_state_row->>'acted_by',
            'ack_at',        v_state_row->>'acted_at',
            'days_to_event', v_days_to_event,
            'payload',       v_pool
          ));
        ELSIF r_required AND r_total > 0 AND r_available = 0 THEN
          v_item_key  := 'crew/role/' || r_role || '/exhausted';
          v_state_row := v_state_map->v_item_key;
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'item_key',      v_item_key,
            'dimension',     'crew',
            'severity',      'high',
            'state',         COALESCE(v_state_row->>'state', 'open'),
            'title',         r_role || ' pool exhausted',
            'subtitle',      r_total::text || ' of ' || r_total::text || ' booked elsewhere',
            'ack_note',      v_state_row->>'ack_note',
            'ack_by',        v_state_row->>'acted_by',
            'ack_at',        v_state_row->>'acted_at',
            'days_to_event', v_days_to_event,
            'payload',       v_pool
          ));
        ELSIF r_required AND r_available < r_qty AND r_available > 0 THEN
          v_item_key  := 'crew/role/' || r_role || '/short';
          v_state_row := v_state_map->v_item_key;
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'item_key',      v_item_key,
            'dimension',     'crew',
            'severity',      'medium',
            'state',         COALESCE(v_state_row->>'state', 'open'),
            'title',         r_role || ' tight',
            'subtitle',      r_available::text || ' of ' || r_qty::text || ' open',
            'ack_note',      v_state_row->>'ack_note',
            'ack_by',        v_state_row->>'acted_by',
            'ack_at',        v_state_row->>'acted_at',
            'days_to_event', v_days_to_event,
            'payload',       v_pool
          ));
        ELSIF r_total > 0 AND r_available = 1 THEN
          v_item_key  := 'crew/role/' || r_role || '/at_risk';
          v_state_row := v_state_map->v_item_key;
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'item_key',      v_item_key,
            'dimension',     'crew',
            'severity',      'medium',
            'state',         COALESCE(v_state_row->>'state', 'open'),
            'title',         r_role || ' at risk',
            'subtitle',      'Last available on hold',
            'ack_note',      v_state_row->>'ack_note',
            'ack_by',        v_state_row->>'acted_by',
            'ack_at',        v_state_row->>'acted_at',
            'days_to_event', v_days_to_event,
            'payload',       v_pool
          ));
        END IF;
      END;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'deal_id',         p_deal_id,
    'proposed_date',   v_proposed_date,
    'archetype_slug',  v_archetype_slug,
    'days_to_event',   v_days_to_event,
    'conflicts',       v_conflicts,
    'total_conflicts', jsonb_array_length(v_conflicts),
    'soft_load',       v_soft_load
  );
END;
$function$;

-- Grants are preserved by CREATE OR REPLACE when the signature matches, but
-- we restate them defensively per the function-grant landmine documented in
-- feedback_postgres_function_grants auto-memory.
REVOKE EXECUTE ON FUNCTION ops.feasibility_check_for_deal(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.feasibility_check_for_deal(uuid) TO authenticated, service_role;
