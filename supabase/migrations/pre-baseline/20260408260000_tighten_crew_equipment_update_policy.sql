-- A2 fix: Extend UPDATE policy to guard ALL verification columns, not just verification_status.
-- Uses a BEFORE UPDATE trigger that silently reverts verification column changes
-- unless the caller is a SECURITY DEFINER RPC that sets the bypass variable.

CREATE OR REPLACE FUNCTION ops.guard_crew_equipment_verification_columns()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- If verification columns are being changed and caller is not a SECURITY DEFINER context,
  -- block the change. SECURITY DEFINER RPCs set session variable to bypass this.
  IF (NEW.verification_status IS DISTINCT FROM OLD.verification_status
      OR NEW.verified_at IS DISTINCT FROM OLD.verified_at
      OR NEW.verified_by IS DISTINCT FROM OLD.verified_by
      OR NEW.rejection_reason IS DISTINCT FROM OLD.rejection_reason)
     AND current_setting('app.bypass_verification_guard', true) IS DISTINCT FROM 'true'
  THEN
    -- Revert verification columns to their old values
    NEW.verification_status := OLD.verification_status;
    NEW.verified_at := OLD.verified_at;
    NEW.verified_by := OLD.verified_by;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER guard_verification_columns
  BEFORE UPDATE ON ops.crew_equipment
  FOR EACH ROW EXECUTE FUNCTION ops.guard_crew_equipment_verification_columns();

-- Update the SECURITY DEFINER RPC to set the bypass variable
CREATE OR REPLACE FUNCTION review_crew_equipment(
  p_crew_equipment_id uuid,
  p_decision text,
  p_rejection_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_workspace_id uuid;
  v_user_role text;
BEGIN
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM ops.crew_equipment
  WHERE id = p_crew_equipment_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Equipment not found';
  END IF;

  SELECT role INTO v_user_role
  FROM public.workspace_members
  WHERE workspace_id = v_workspace_id
    AND user_id = auth.uid();

  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Not authorised: only workspace owners and admins can review equipment';
  END IF;

  -- Set bypass variable so the trigger allows verification column changes
  PERFORM set_config('app.bypass_verification_guard', 'true', true);

  UPDATE ops.crew_equipment
  SET
    verification_status = p_decision,
    verified_at = now(),
    verified_by = auth.uid(),
    rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_crew_equipment_id;
END;
$$;

-- Also update bulk_approve to use the bypass
CREATE OR REPLACE FUNCTION bulk_approve_pending_equipment(
  p_workspace_id uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_user_role text;
  v_count integer;
BEGIN
  SELECT role INTO v_user_role
  FROM public.workspace_members
  WHERE workspace_id = p_workspace_id
    AND user_id = auth.uid();

  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Not authorised';
  END IF;

  PERFORM set_config('app.bypass_verification_guard', 'true', true);

  UPDATE ops.crew_equipment
  SET verification_status = 'approved',
      verified_at = now(),
      verified_by = auth.uid()
  WHERE workspace_id = p_workspace_id
    AND verification_status = 'pending';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
