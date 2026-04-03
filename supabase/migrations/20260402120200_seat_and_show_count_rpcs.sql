-- Migration 2.1 + 2.6: Seat/show counting RPCs and seat limit safety-net trigger.
-- Phase 2 of the subscription tier migration.

BEGIN;

-- ─── count_team_seats ──────────────────────────────────────────────────────
-- Count workspace_members rows that are NOT the employee role.
-- Employee role is free/unlimited and does not count as a "team seat".

CREATE OR REPLACE FUNCTION count_team_seats(p_workspace_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ops
AS $$
  SELECT count(*)::integer
  FROM workspace_members wm
  LEFT JOIN ops.workspace_roles wr ON wr.id = wm.role_id
  WHERE wm.workspace_id = p_workspace_id
    AND (wr.slug IS NULL OR wr.slug <> 'employee')
$$;

-- ─── get_workspace_seat_limit ──────────────────────────────────────────────
-- Returns included_seats + extra_seats for a workspace.

CREATE OR REPLACE FUNCTION get_workspace_seat_limit(p_workspace_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public, ops
AS $$
  SELECT tc.included_seats + coalesce(w.extra_seats, 0)
  FROM workspaces w
  JOIN tier_config tc ON tc.tier = w.subscription_tier
  WHERE w.id = p_workspace_id
$$;

-- ─── count_active_shows ────────────────────────────────────────────────────
-- Count non-lost, non-archived deals in a workspace.

CREATE OR REPLACE FUNCTION count_active_shows(p_workspace_id uuid)
RETURNS integer LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT count(*)::integer
  FROM deals
  WHERE workspace_id = p_workspace_id
    AND archived_at IS NULL
    AND status NOT IN ('lost')
$$;

-- ─── Seat limit safety-net trigger ─────────────────────────────────────────
-- BEFORE INSERT on workspace_members. Catches race conditions where two
-- concurrent invites both pass the application-level check.

CREATE OR REPLACE FUNCTION check_seat_limit() RETURNS trigger LANGUAGE plpgsql
SET search_path = public, ops
AS $$
DECLARE
  v_current integer;
  v_limit integer;
  v_role_slug text;
BEGIN
  -- Look up the role slug for the new member
  SELECT slug INTO v_role_slug FROM ops.workspace_roles WHERE id = NEW.role_id;

  -- Employee role is free, skip the check
  IF v_role_slug = 'employee' THEN RETURN NEW; END IF;

  -- Count current team seats (before this insert) and get limit
  SELECT count_team_seats(NEW.workspace_id) INTO v_current;
  SELECT get_workspace_seat_limit(NEW.workspace_id) INTO v_limit;

  -- If limit is NULL (workspace has no tier_config row yet, e.g. during initial setup), allow
  IF v_limit IS NULL THEN RETURN NEW; END IF;

  -- Block if at or over limit (current is pre-insert count, so >= means the new row would exceed)
  IF v_current >= v_limit THEN
    RAISE EXCEPTION 'Seat limit reached (% of %)', v_current, v_limit;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER enforce_seat_limit
  BEFORE INSERT ON workspace_members
  FOR EACH ROW EXECUTE FUNCTION check_seat_limit();

COMMIT;
