-- Date-availability feasibility chip — Fork B per
-- docs/reference/date-availability-badge-design.md (2026-04-26).
--
-- Replaces the hardcoded "Top 3 Leads Available" badge in the create-gig
-- modal with a deterministic three-color signal grounded in named, defensible
-- sources:
--   1. Confirmed shows on this date         → ops.events (red)
--   2. Open deals proposing this date       → public.deals (amber)
--   3. Preferred crew with self-reported    → directory.entities.attributes
--      blackouts overlapping this date          .availability_blackouts (amber)
--
-- Single public RPC (callable by authenticated + service_role); three
-- internal helpers split for readability and so future surfaces (Sales
-- dashboard `This Week` ribbon, Daily Brief insight, Handoff wizard Step 1)
-- can compose them without re-implementing the joins.
--
-- Auth posture:
--   * SECURITY DEFINER (RLS bypass — replaced by an explicit
--     workspace_members check in the function body)
--   * Dual-context: UI calls require auth.uid() workspace membership;
--     service_role bypasses cleanly (cron, Aion brief consumers eventually).
--     Pattern per /Users/danielarthur/.claude/.../feedback_security_definer_dual_context.md
--   * REVOKE from PUBLIC + anon explicitly (per the April 2026 sev-zero
--     in client_* RPCs). Audit DO block at the bottom enforces.
--
-- Timezone correctness:
--   * public.deals.proposed_date is `date` (no time, no timezone)
--   * ops.events.starts_at is `timestamptz` paired with a separate
--     ops.events.timezone column
--   * The confirmed-show overlap compares events in their own local zone
--     ((starts_at AT TIME ZONE timezone)::date) so a late-night Friday
--     show that crosses midnight UTC into Saturday still reads as Friday.
--
-- Out of scope for this migration (per design doc §8):
--   * Travel buffer / geographic substrate
--   * Crew role context
--   * Multi-day deal ranges as first-class data
--   * Sales dashboard / Daily Brief / Handoff / Follow-up consumption

-- ─────────────────────────────────────────────────────────────────────────
-- Helper: confirmed shows overlapping a given workspace-local date
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops._feasibility_confirmed_shows(
  p_workspace_id uuid,
  p_date         date
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',         e.id,
        'title',      COALESCE(e.title, 'Untitled show'),
        'starts_at',  e.starts_at,
        'venue_id',   e.venue_entity_id
      )
      ORDER BY e.starts_at
    ),
    '[]'::jsonb
  )
  FROM ops.events e
  WHERE e.workspace_id = p_workspace_id
    AND e.archived_at IS NULL
    AND e.lifecycle_status IS DISTINCT FROM 'cancelled'
    AND e.lifecycle_status IS DISTINCT FROM 'archived'
    AND (e.starts_at AT TIME ZONE COALESCE(e.timezone, 'UTC'))::date <= p_date
    AND (COALESCE(e.ends_at, e.starts_at) AT TIME ZONE COALESCE(e.timezone, 'UTC'))::date >= p_date;
$function$;

COMMENT ON FUNCTION ops._feasibility_confirmed_shows(uuid, date) IS
  'Internal helper for ops.feasibility_check_for_date. Returns jsonb array of confirmed shows whose local-zone date range overlaps p_date. Excludes cancelled/archived events.';

REVOKE EXECUTE ON FUNCTION ops._feasibility_confirmed_shows(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops._feasibility_confirmed_shows(uuid, date) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Helper: open deals proposing this date (excluding the current one if any)
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops._feasibility_open_deals(
  p_workspace_id    uuid,
  p_date            date,
  p_exclude_deal_id uuid DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
  WITH tentative_stages AS (
    -- Stage tags `initial_contact` and `proposal_sent` are the canonical
    -- "pre-contract" identifiers, resolved by tag rather than slug because
    -- workspaces customize stage names. Mirror of the pattern in
    -- src/app/(dashboard)/(features)/crm/actions/check-date-feasibility.ts
    -- so behavior is preserved through the rebuild.
    SELECT s.id
    FROM ops.pipelines       p
    JOIN ops.pipeline_stages s ON s.pipeline_id = p.id
    WHERE p.workspace_id = p_workspace_id
      AND p.is_default
      AND NOT p.is_archived
      AND NOT s.is_archived
      AND (s.tags && ARRAY['initial_contact', 'proposal_sent']::text[])
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',          d.id,
        'title',       COALESCE(d.title, 'Untitled deal'),
        'stage_label', stg.label,
        'stage_id',    d.stage_id
      )
      ORDER BY d.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.deals       d
  LEFT JOIN ops.pipeline_stages stg ON stg.id = d.stage_id
  WHERE d.workspace_id    = p_workspace_id
    AND d.archived_at     IS NULL
    AND d.proposed_date   = p_date
    AND d.event_id        IS NULL  -- post-handoff, the show lives in ops.events; counted there
    AND d.id              IS DISTINCT FROM p_exclude_deal_id
    AND d.stage_id IN (SELECT id FROM tentative_stages);
$function$;

COMMENT ON FUNCTION ops._feasibility_open_deals(uuid, date, uuid) IS
  'Internal helper for ops.feasibility_check_for_date. Returns jsonb array of open (pre-contract) deals proposing p_date in this workspace, excluding p_exclude_deal_id.';

REVOKE EXECUTE ON FUNCTION ops._feasibility_open_deals(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops._feasibility_open_deals(uuid, date, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Helper: preferred-crew blackouts overlapping this date (Fork B addition)
-- ─────────────────────────────────────────────────────────────────────────
-- Reads directory.entities.attributes.availability_blackouts (an array of
-- {start, end} ranges written by the artist/DJ portal — until now, nothing
-- read them) for the workspace's inner-circle PARTNER edges with
-- context_data.tier = 'preferred'. Scoped narrowly to the preferred pool so
-- the popover doesn't surface every random blackout in the workspace.

CREATE OR REPLACE FUNCTION ops._feasibility_recurring_blackouts(
  p_workspace_id uuid,
  p_date         date
)
  RETURNS jsonb
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public', 'directory', 'cortex'
AS $function$
  WITH preferred_partners AS (
    -- The workspace's "inner circle" — PARTNER edges with tier=preferred
    -- where the source entity belongs to this workspace. (Direction is
    -- always source=workspace's org entity → target=person, per
    -- src/features/network-data/api/ghost-actions.ts:summonPersonGhost.)
    SELECT DISTINCT e.id            AS entity_id,
                    e.display_name,
                    e.attributes
    FROM cortex.relationships r
    JOIN directory.entities src ON src.id = r.source_entity_id
    JOIN directory.entities e   ON e.id   = r.target_entity_id
    WHERE r.relationship_type = 'PARTNER'
      AND r.context_data->>'tier' = 'preferred'
      AND COALESCE(r.context_data->>'lifecycle_status', 'active') = 'active'
      AND r.context_data->>'deleted_at' IS NULL
      AND src.owner_workspace_id = p_workspace_id
      AND e.type = 'person'
  ),
  expanded_blackouts AS (
    -- Unnest each preferred partner's blackouts and keep only ranges
    -- containing p_date. JSONB shape: {"start": "yyyy-MM-dd", "end": "yyyy-MM-dd"}.
    SELECT pp.entity_id,
           pp.display_name,
           (b->>'start')::date AS range_start,
           (b->>'end')::date   AS range_end
    FROM preferred_partners pp,
         LATERAL jsonb_array_elements(
           COALESCE(pp.attributes->'availability_blackouts', '[]'::jsonb)
         ) AS b
    WHERE (b->>'start') IS NOT NULL
      AND (b->>'end')   IS NOT NULL
      AND p_date >= (b->>'start')::date
      AND p_date <= (b->>'end')::date
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'entity_id',   eb.entity_id,
        'entity_name', COALESCE(eb.display_name, 'Crew member'),
        'range_start', eb.range_start,
        'range_end',   eb.range_end,
        'source',      'self-reported'
      )
      ORDER BY eb.display_name NULLS LAST
    ),
    '[]'::jsonb
  )
  FROM expanded_blackouts eb;
$function$;

COMMENT ON FUNCTION ops._feasibility_recurring_blackouts(uuid, date) IS
  'Internal helper for ops.feasibility_check_for_date (Fork B). Returns jsonb array of preferred crew (PARTNER + tier=preferred) with self-reported blackouts overlapping p_date. Source is directory.entities.attributes.availability_blackouts.';

REVOKE EXECUTE ON FUNCTION ops._feasibility_recurring_blackouts(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops._feasibility_recurring_blackouts(uuid, date) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Public RPC — the only entry point app code calls
-- ─────────────────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION ops.feasibility_check_for_date(
  p_workspace_id    uuid,
  p_date            date,
  p_current_deal_id uuid DEFAULT NULL
)
  RETURNS jsonb
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'ops', 'public'
AS $function$
DECLARE
  v_confirmed_shows  jsonb;
  v_open_deals       jsonb;
  v_blackouts        jsonb;
  v_state            text;
BEGIN
  -- Dual-context auth: when called from a UI session, require workspace
  -- membership. Service-role callers (cron, Daily Brief consumers later)
  -- bypass cleanly because auth.uid() returns NULL. Pattern per
  -- feedback_security_definer_dual_context auto-memory.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Compose the three signal classes from internal helpers.
  v_confirmed_shows := ops._feasibility_confirmed_shows(p_workspace_id, p_date);
  v_open_deals      := ops._feasibility_open_deals(p_workspace_id, p_date, p_current_deal_id);
  v_blackouts       := ops._feasibility_recurring_blackouts(p_workspace_id, p_date);

  -- State resolution — color-driving signal hierarchy:
  --   confirmed shows present → 'confirmed' (red)
  --   else open deals present → 'pending'   (amber)
  --   else                    → 'open'      (neutral)
  --
  -- Blackouts are returned in the popover but DO NOT escalate the badge
  -- color. Owners may not yet trust portal-written self-reported blackouts
  -- enough to gate "yes" on them (open question §9.3 in the design doc).
  -- Adding them as informational data only is the conservative stance.
  IF jsonb_array_length(v_confirmed_shows) > 0 THEN
    v_state := 'confirmed';
  ELSIF jsonb_array_length(v_open_deals) > 0 THEN
    v_state := 'pending';
  ELSE
    v_state := 'open';
  END IF;

  RETURN jsonb_build_object(
    'state',                v_state,
    'confirmed_show_count', jsonb_array_length(v_confirmed_shows),
    'confirmed_shows',      v_confirmed_shows,
    'pending_deal_count',   jsonb_array_length(v_open_deals),
    'pending_deals',        v_open_deals,
    'blackout_count',       jsonb_array_length(v_blackouts),
    'blackouts',            v_blackouts
  );
END;
$function$;

COMMENT ON FUNCTION ops.feasibility_check_for_date(uuid, date, uuid) IS
  'Date-availability feasibility chip RPC. Returns deterministic three-color signal {state: open|pending|confirmed} with named conflict lists for the tap-popover. Composes ops._feasibility_confirmed_shows + ops._feasibility_open_deals + ops._feasibility_recurring_blackouts. Dual-context auth (UI requires workspace membership; service_role bypasses).';

REVOKE EXECUTE ON FUNCTION ops.feasibility_check_for_date(uuid, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.feasibility_check_for_date(uuid, date, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Safety audit — fail the migration if anon/PUBLIC accidentally retains
-- EXECUTE on any of the four functions. Belt + suspenders.
-- ─────────────────────────────────────────────────────────────────────────

DO $$
DECLARE
  v_pub_helpers boolean;
  v_anon_helpers boolean;
  v_auth_helpers boolean;
  v_pub_public boolean;
  v_anon_public boolean;
BEGIN
  -- Helpers must be locked to service_role only.
  SELECT BOOL_OR(has_function_privilege('public', oid, 'EXECUTE'))
    INTO v_pub_helpers
    FROM pg_proc
    WHERE oid IN (
      'ops._feasibility_confirmed_shows(uuid, date)'::regprocedure,
      'ops._feasibility_open_deals(uuid, date, uuid)'::regprocedure,
      'ops._feasibility_recurring_blackouts(uuid, date)'::regprocedure
    );
  SELECT BOOL_OR(has_function_privilege('anon', oid, 'EXECUTE'))
    INTO v_anon_helpers
    FROM pg_proc
    WHERE oid IN (
      'ops._feasibility_confirmed_shows(uuid, date)'::regprocedure,
      'ops._feasibility_open_deals(uuid, date, uuid)'::regprocedure,
      'ops._feasibility_recurring_blackouts(uuid, date)'::regprocedure
    );
  SELECT BOOL_OR(has_function_privilege('authenticated', oid, 'EXECUTE'))
    INTO v_auth_helpers
    FROM pg_proc
    WHERE oid IN (
      'ops._feasibility_confirmed_shows(uuid, date)'::regprocedure,
      'ops._feasibility_open_deals(uuid, date, uuid)'::regprocedure,
      'ops._feasibility_recurring_blackouts(uuid, date)'::regprocedure
    );

  IF v_pub_helpers OR v_anon_helpers OR v_auth_helpers THEN
    RAISE EXCEPTION 'Safety audit: ops._feasibility_* helpers leak EXECUTE (public=% anon=% auth=%)',
      v_pub_helpers, v_anon_helpers, v_auth_helpers;
  END IF;

  -- Public RPC must be locked to PUBLIC + anon.
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub_public
    FROM pg_proc WHERE oid = 'ops.feasibility_check_for_date(uuid, date, uuid)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon_public
    FROM pg_proc WHERE oid = 'ops.feasibility_check_for_date(uuid, date, uuid)'::regprocedure;

  IF v_pub_public OR v_anon_public THEN
    RAISE EXCEPTION 'Safety audit: ops.feasibility_check_for_date leaks EXECUTE (public=% anon=%)',
      v_pub_public, v_anon_public;
  END IF;
END $$;
