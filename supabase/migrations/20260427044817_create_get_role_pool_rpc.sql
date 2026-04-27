-- Phase 2.1 Sprint 1 — get_role_pool RPC.
--
-- Returns the workspace's pool of crew tagged with a given role_tag, split
-- into in-house (ROSTER_MEMBER edges) and preferred (PARTNER edges with
-- tier=preferred). Each in-house entry is annotated with whether the person
-- is committed elsewhere on the queried date — that's the "DJ pool: 0 of 2"
-- signal the Phase 2 chip will eventually consume.
--
-- Sprint 1 scope: counts and named-list output. Sprint 3 plugs this into
-- the chip via the archetype role-mix matrix. Sprint 4 composes it into
-- ops.feasibility_check_for_deal.
--
-- Pool shape decisions (Critic's cuts applied):
--   * In-house = ROSTER_MEMBER edges (employed staff) with crew_skills
--     row matching the role_tag.
--   * Preferred = PARTNER edges with context_data.tier='preferred', filtered
--     to person entities (freelancers) for now. Company sub-vendor support
--     comes in Phase 2.2 via a roles_filled JSONB field on the edge.
--   * "Committed" check: entity has a confirmed deal_crew row on a deal
--     whose proposed_date matches, or an event whose starts_at matches
--     (timezone-aware via ops.events.timezone). Mirrors Phase 1's
--     _feasibility_confirmed_shows / _feasibility_open_deals logic.
--
-- Auth posture (per Phase 2 design doc §3.4):
--   * SECURITY DEFINER (RLS bypass replaced by explicit workspace-membership
--     check inside the body)
--   * Dual-context: UI requires auth.uid() workspace membership; service_role
--     bypasses cleanly. Pattern per feedback_security_definer_dual_context.
--   * REVOKE FROM PUBLIC, anon (per the April 2026 sev-zero in client_*).
--   * Audit DO block enforces.

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
  -- Dual-context auth.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Identify in-house people: ROSTER_MEMBER edges whose source entity is
  -- owned by this workspace, target is a person, and the person has a
  -- crew_skills row tagged with the requested role.
  WITH workspace_orgs AS (
    SELECT id FROM directory.entities
    WHERE owner_workspace_id = p_workspace_id
  ),
  in_house_entities AS (
    SELECT DISTINCT e.id, e.display_name
    FROM cortex.relationships r
    JOIN directory.entities e ON e.id = r.target_entity_id
    JOIN ops.crew_skills cs   ON cs.entity_id = e.id
                              AND cs.workspace_id = p_workspace_id
                              AND cs.role_tag = p_role_tag
    WHERE r.relationship_type = 'ROSTER_MEMBER'
      AND r.source_entity_id IN (SELECT id FROM workspace_orgs)
      AND e.type = 'person'
      AND COALESCE(r.context_data->>'lifecycle_status', 'active') = 'active'
      AND r.context_data->>'deleted_at' IS NULL
  ),
  -- Per-entity commitment check on the requested date (NULL date = no check).
  -- Committed if the person has either:
  --   (a) a deal_crew row on a deal whose proposed_date = p_date AND
  --       confirmed_at IS NOT NULL AND declined_at IS NULL, OR
  --   (b) a deal_crew row on a deal whose event_id resolves to an
  --       ops.events row whose starts_at..ends_at overlaps p_date in the
  --       event's local timezone.
  in_house_committed AS (
    SELECT
      ihe.id,
      ihe.display_name,
      CASE
        WHEN p_date IS NULL THEN false
        ELSE EXISTS (
          SELECT 1 FROM ops.deal_crew dc
          JOIN public.deals d ON d.id = dc.deal_id
          WHERE dc.entity_id     = ihe.id
            AND dc.workspace_id  = p_workspace_id
            AND dc.declined_at   IS NULL
            AND dc.confirmed_at  IS NOT NULL
            AND d.archived_at    IS NULL
            AND d.proposed_date  = p_date
        )
        OR EXISTS (
          SELECT 1 FROM ops.deal_crew dc
          JOIN ops.events ev ON ev.deal_id = dc.deal_id
          WHERE dc.entity_id     = ihe.id
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
      -- Best-effort label for the conflict (first matching deal/event title).
      (
        SELECT COALESCE(d.title, ev.title, 'Untitled')
        FROM ops.deal_crew dc
        LEFT JOIN public.deals d ON d.id = dc.deal_id
        LEFT JOIN ops.events ev ON ev.deal_id = dc.deal_id
        WHERE dc.entity_id    = ihe.id
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
    FROM in_house_entities ihe
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

  -- Preferred sub-vendors: PARTNER edges with tier=preferred, filtered to
  -- people for now (companies join the pool in Phase 2.2 via roles_filled).
  -- Carries last_used_at (max confirmed_at across deal_crew rows) for the
  -- read-only picker sort; no acceptance rate at Sprint 1.
  WITH workspace_orgs AS (
    SELECT id FROM directory.entities
    WHERE owner_workspace_id = p_workspace_id
  ),
  preferred_entities AS (
    SELECT DISTINCT e.id, e.display_name
    FROM cortex.relationships r
    JOIN directory.entities e ON e.id = r.target_entity_id
    JOIN ops.crew_skills cs   ON cs.entity_id = e.id
                              AND cs.workspace_id = p_workspace_id
                              AND cs.role_tag = p_role_tag
    WHERE r.relationship_type IN ('PARTNER', 'INDUSTRY_PARTNER')
      AND r.context_data->>'tier' = 'preferred'
      AND r.source_entity_id IN (SELECT id FROM workspace_orgs)
      AND e.type = 'person'
      AND COALESCE(r.context_data->>'lifecycle_status', 'active') = 'active'
      AND r.context_data->>'deleted_at' IS NULL
  ),
  preferred_with_history AS (
    SELECT
      pe.id,
      pe.display_name,
      (
        SELECT MAX(dc.confirmed_at)
        FROM ops.deal_crew dc
        WHERE dc.entity_id    = pe.id
          AND dc.workspace_id = p_workspace_id
          AND dc.confirmed_at IS NOT NULL
      ) AS last_used_at
    FROM preferred_entities pe
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
  'Phase 2.1 — workspace role pool for a given role_tag. Returns jsonb with in-house (ROSTER_MEMBER + crew_skills.role_tag, with per-date commitment status) and preferred (PARTNER+tier=preferred, person-only at Sprint 1). Auth: dual-context. Latency budget: well under 200ms p95.';

REVOKE EXECUTE ON FUNCTION ops.get_role_pool(uuid, text, date) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.get_role_pool(uuid, text, date) TO authenticated, service_role;

-- Audit
DO $$
DECLARE
  v_pub  boolean;
  v_anon boolean;
  v_path boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'ops.get_role_pool(uuid, text, date)'::regprocedure;
  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'ops.get_role_pool(uuid, text, date)'::regprocedure;
  SELECT proconfig IS NOT NULL INTO v_path
    FROM pg_proc WHERE oid = 'ops.get_role_pool(uuid, text, date)'::regprocedure;

  IF v_pub OR v_anon THEN
    RAISE EXCEPTION 'Safety audit: ops.get_role_pool leaks EXECUTE (public=% anon=%)', v_pub, v_anon;
  END IF;
  IF NOT v_path THEN
    RAISE EXCEPTION 'Safety audit: ops.get_role_pool has mutable search_path';
  END IF;
END $$;
