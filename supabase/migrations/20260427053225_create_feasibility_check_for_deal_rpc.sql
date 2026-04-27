-- Phase 2.1 Sprint 4 — feasibility_check_for_deal composite RPC.
--
-- The Conflicts panel calls this with a deal_id and gets back the fully
-- composed list of conflict items already split by state and dimension.
-- Items are derived per call by composing the Phase 1 + Phase 2.1 helpers
-- (confirmed_shows / open_deals / blackouts / role pools) and LEFT JOINed
-- against ops.deal_open_items by item_key for current state.
--
-- Performance budget per Phase 2 design doc §3.6: <200ms p95. Composite
-- of ~5 helpers, all already proven fast in isolation. If load testing
-- shows we're bumping the ceiling, ops.feasibility_cache (deal_id keyed)
-- is the planned mitigation.
--
-- Returns shape (jsonb):
--   {
--     deal_id, proposed_date, archetype_slug,
--     conflicts: [
--       {
--         item_key, dimension (crew|gear|travel|scope), severity, state,
--         title, subtitle, ack_note, ack_by, ack_at, days_to_event,
--         payload: { ... raw helper output for the row ... }
--       },
--       ...
--     ]
--   }

CREATE OR REPLACE FUNCTION ops.feasibility_check_for_deal(
  p_deal_id uuid
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
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
  v_state_map      jsonb := '{}'::jsonb;
  v_conflicts      jsonb := '[]'::jsonb;
  v_days_to_event  int;
  v_pool           jsonb;
  v_show           jsonb;
  v_deal           jsonb;
  v_blackout       jsonb;
  v_item_key       text;
  v_state_row      jsonb;
BEGIN
  -- Look up the deal first (single round-trip; saves us a workspace check
  -- against an arbitrary workspace_id parameter).
  SELECT d.workspace_id, d.proposed_date, d.event_archetype
  INTO   v_workspace_id, v_proposed_date, v_archetype_slug
  FROM   public.deals d
  WHERE  d.id = p_deal_id
    AND  d.archived_at IS NULL;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'deal not found or archived: %', p_deal_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Dual-context auth on the deal's workspace.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE workspace_id = v_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', v_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Days to event — for triage-aware impact ranking in the panel.
  IF v_proposed_date IS NOT NULL THEN
    v_days_to_event := (v_proposed_date - CURRENT_DATE);
  END IF;

  -- Pull current state for this deal as a {item_key: state_row} map.
  -- Single query, then extract values per derived item.
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

  -- Compose helper outputs only when we have a date (else most are no-ops).
  IF v_proposed_date IS NOT NULL THEN
    v_confirmed  := ops._feasibility_confirmed_shows(v_workspace_id, v_proposed_date);
    v_open_deals := ops._feasibility_open_deals(v_workspace_id, v_proposed_date, p_deal_id);
    v_blackouts  := ops._feasibility_recurring_blackouts(v_workspace_id, v_proposed_date);
  ELSE
    v_confirmed  := '[]'::jsonb;
    v_open_deals := '[]'::jsonb;
    v_blackouts  := '[]'::jsonb;
  END IF;

  -- Crew role pools (archetype-aware if archetype is set; sparse otherwise).
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

  -- ── Confirmed shows ──────────────────────────────────────────────────
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

  -- ── Open deals ───────────────────────────────────────────────────────
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

  -- ── Blackouts (preferred crew self-reported) ────────────────────────
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

  -- ── Role pool gaps (only when archetype is set; otherwise skip — sparse
  --    mode pools aren't conflicts, they're informational) ─────────────
  IF v_archetype_slug IS NOT NULL AND v_archetype_slug <> '' THEN
    FOR v_pool IN SELECT * FROM jsonb_array_elements(v_pools)
    LOOP
      DECLARE
        r_role         text       := v_pool->>'role_tag';
        r_required     boolean    := NOT COALESCE((v_pool->>'is_optional')::boolean, true);
        r_qty          int        := COALESCE((v_pool->>'qty_required')::int, 1);
        r_total        int        := COALESCE((v_pool->>'in_house_total')::int, 0);
        r_available    int        := COALESCE((v_pool->>'in_house_available')::int, 0);
      BEGIN
        -- Required role with no one tagged → red gap.
        IF r_required AND r_total = 0 THEN
          v_item_key  := 'crew/role/' || r_role || '/empty';
          v_state_row := v_state_map->v_item_key;
          v_conflicts := v_conflicts || jsonb_build_array(jsonb_build_object(
            'item_key',      v_item_key,
            'dimension',     'crew',
            'severity',      'high',
            'state',         COALESCE(v_state_row->>'state', 'open'),
            'title',         r_role || ' — not set up',
            'subtitle',      'Tag your team in Roster to see availability',
            'ack_note',      v_state_row->>'ack_note',
            'ack_by',        v_state_row->>'acted_by',
            'ack_at',        v_state_row->>'acted_at',
            'days_to_event', v_days_to_event,
            'payload',       v_pool
          ));

        -- Required role with everyone booked → red gap.
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

        -- Required role short of qty (have some, but fewer than needed) → amber.
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

        -- Last available person on hold (regardless of required/optional) → amber.
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
    'total_conflicts', jsonb_array_length(v_conflicts)
  );
END;
$function$;

COMMENT ON FUNCTION ops.feasibility_check_for_deal(uuid) IS
  'Phase 2.1 Sprint 4 — composite conflicts RPC for the deal-page Conflicts panel. Composes Phase 1 (_feasibility_confirmed_shows/_open_deals/_recurring_blackouts) + Sprint 1/3 (get_role_pools_for_archetype) helpers and LEFT JOINs ops.deal_open_items by item_key for state attachment. Latency budget <200ms p95.';

REVOKE EXECUTE ON FUNCTION ops.feasibility_check_for_deal(uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.feasibility_check_for_deal(uuid) TO authenticated, service_role;

-- Audit
DO $$
DECLARE
  v_pub  boolean;
  v_anon boolean;
  v_path boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'ops.feasibility_check_for_deal(uuid)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'ops.feasibility_check_for_deal(uuid)'::regprocedure;
  SELECT proconfig IS NOT NULL INTO v_path
    FROM pg_proc WHERE oid = 'ops.feasibility_check_for_deal(uuid)'::regprocedure;

  IF v_pub OR v_anon THEN
    RAISE EXCEPTION 'Safety audit: ops.feasibility_check_for_deal leaks EXECUTE (public=% anon=%)', v_pub, v_anon;
  END IF;
  IF NOT v_path THEN
    RAISE EXCEPTION 'Safety audit: ops.feasibility_check_for_deal has mutable search_path';
  END IF;
END $$;
