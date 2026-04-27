-- Date-availability feasibility chip — fix: count committed deals as booked.
--
-- The original migration (20260426223748_feasibility_check_rpc) only counted
-- deals tagged 'initial_contact' or 'proposal_sent' as soft conflicts (amber).
-- Deals tagged contract_out / contract_signed / deposit_received slipped
-- through entirely, so a "Contract Sent" deal on a date showed as Open. Bug.
--
-- A contract-sent deal is functionally a booking — the client has said yes,
-- paperwork is in flight. The owner expects to see the date marked booked.
-- Same for contract_signed and deposit_received (which are upstream of
-- handoff; once handed off, an ops.events row exists and is counted there).
--
-- Fix:
--   _feasibility_open_deals now returns ALL pre-handoff non-terminal deals
--   tagged with one of: initial_contact, proposal_sent, contract_out,
--   contract_signed, deposit_received, ready_for_handoff. Each row carries
--   an `is_committed` boolean — true for contract_out and beyond.
--
--   The public RPC escalates state to 'confirmed' (red) when there's any
--   ops.events row OR any committed deal. The 'pending' (amber) state now
--   means "in-flight only" (initial_contact + proposal_sent).

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
  WITH pre_handoff_stages AS (
    -- Every pre-handoff non-terminal stage in the workspace's default
    -- pipeline. Resolved by tag (workspaces may rename labels). The tag
    -- 'ready_for_handoff' co-occurs with 'deposit_received' on the same
    -- stage; either way we want it counted.
    SELECT s.id,
           (s.tags && ARRAY['contract_out', 'contract_signed', 'deposit_received', 'ready_for_handoff']::text[]) AS is_committed
    FROM ops.pipelines       p
    JOIN ops.pipeline_stages s ON s.pipeline_id = p.id
    WHERE p.workspace_id = p_workspace_id
      AND p.is_default
      AND NOT p.is_archived
      AND NOT s.is_archived
      AND (s.tags && ARRAY[
        'initial_contact', 'proposal_sent',
        'contract_out', 'contract_signed', 'deposit_received', 'ready_for_handoff'
      ]::text[])
  )
  SELECT COALESCE(
    jsonb_agg(
      jsonb_build_object(
        'id',           d.id,
        'title',        COALESCE(d.title, 'Untitled deal'),
        'stage_label',  stg.label,
        'stage_id',     d.stage_id,
        'is_committed', phs.is_committed
      )
      -- Order committed-first so the popover surfaces the most-committed
      -- conflict at the top.
      ORDER BY phs.is_committed DESC, d.created_at DESC
    ),
    '[]'::jsonb
  )
  FROM public.deals       d
  JOIN pre_handoff_stages phs ON phs.id = d.stage_id
  LEFT JOIN ops.pipeline_stages stg ON stg.id = d.stage_id
  WHERE d.workspace_id    = p_workspace_id
    AND d.archived_at     IS NULL
    AND d.proposed_date   = p_date
    AND d.event_id        IS NULL
    AND d.id              IS DISTINCT FROM p_exclude_deal_id;
$function$;

COMMENT ON FUNCTION ops._feasibility_open_deals(uuid, date, uuid) IS
  'Internal helper for ops.feasibility_check_for_date. Returns jsonb array of pre-handoff non-terminal deals proposing p_date. Each row carries is_committed=true for contract_out / contract_signed / deposit_received / ready_for_handoff stages, false for initial_contact / proposal_sent.';

REVOKE EXECUTE ON FUNCTION ops._feasibility_open_deals(uuid, date, uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION ops._feasibility_open_deals(uuid, date, uuid) TO service_role;

-- ─────────────────────────────────────────────────────────────────────────
-- Public RPC — escalate state to 'confirmed' for committed deals
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
  v_committed_deals  integer;
  v_tentative_deals  integer;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1
    FROM public.workspace_members
    WHERE workspace_id = p_workspace_id
      AND user_id      = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not authorized for workspace %', p_workspace_id
      USING ERRCODE = '42501';
  END IF;

  v_confirmed_shows := ops._feasibility_confirmed_shows(p_workspace_id, p_date);
  v_open_deals      := ops._feasibility_open_deals(p_workspace_id, p_date, p_current_deal_id);
  v_blackouts       := ops._feasibility_recurring_blackouts(p_workspace_id, p_date);

  -- Split deals by commitment so the badge can escalate appropriately.
  -- Committed = contract_out and beyond (effectively a booking).
  -- Tentative = initial_contact / proposal_sent (in flight, not yet committed).
  SELECT
    count(*) FILTER (WHERE (d->>'is_committed')::boolean),
    count(*) FILTER (WHERE NOT (d->>'is_committed')::boolean)
  INTO v_committed_deals, v_tentative_deals
  FROM jsonb_array_elements(v_open_deals) d;

  -- State resolution:
  --   confirmed (red)   = ops.events row OR committed deal
  --   pending   (amber) = tentative deal only
  --   open      (grey)  = nothing
  IF jsonb_array_length(v_confirmed_shows) > 0 OR v_committed_deals > 0 THEN
    v_state := 'confirmed';
  ELSIF v_tentative_deals > 0 THEN
    v_state := 'pending';
  ELSE
    v_state := 'open';
  END IF;

  RETURN jsonb_build_object(
    'state',                 v_state,
    'confirmed_show_count',  jsonb_array_length(v_confirmed_shows),
    'confirmed_shows',       v_confirmed_shows,
    'pending_deal_count',    jsonb_array_length(v_open_deals),
    'pending_deals',         v_open_deals,
    'committed_deal_count',  v_committed_deals,
    'tentative_deal_count',  v_tentative_deals,
    'blackout_count',        jsonb_array_length(v_blackouts),
    'blackouts',             v_blackouts
  );
END;
$function$;

COMMENT ON FUNCTION ops.feasibility_check_for_date(uuid, date, uuid) IS
  'Date-availability feasibility chip RPC. Returns deterministic three-color signal {state: open|pending|confirmed} with named conflict lists for the tap-popover. State escalates to confirmed (red) for ops.events OR committed deals (contract_out and beyond). State pending (amber) means tentative-only (initial_contact / proposal_sent). Composes ops._feasibility_confirmed_shows + ops._feasibility_open_deals + ops._feasibility_recurring_blackouts. Dual-context auth (UI requires workspace membership; service_role bypasses).';

REVOKE EXECUTE ON FUNCTION ops.feasibility_check_for_date(uuid, date, uuid) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION ops.feasibility_check_for_date(uuid, date, uuid) TO authenticated, service_role;
