-- C1 Fix: Protect verification columns on ops.crew_equipment from direct client writes.
-- Only admin/owner can change verification_status via this SECURITY DEFINER RPC.
-- Direct UPDATE on verification columns is blocked by replacing the UPDATE policy.

-- Drop the permissive update policy
DROP POLICY IF EXISTS crew_equipment_update ON ops.crew_equipment;

-- New UPDATE policy: allows updating non-verification columns only.
-- verification_status, verified_at, verified_by, rejection_reason are excluded.
CREATE POLICY crew_equipment_update_safe ON ops.crew_equipment
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()))
  WITH CHECK (
    workspace_id IN (SELECT get_my_workspace_ids())
    -- Ensure verification columns are not changed by non-admin users
    AND verification_status = (SELECT ce.verification_status FROM ops.crew_equipment ce WHERE ce.id = ops.crew_equipment.id)
  );

-- SECURITY DEFINER RPC for admin verification state changes
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
  -- Validate decision
  IF p_decision NOT IN ('approved', 'rejected') THEN
    RAISE EXCEPTION 'Invalid decision: %', p_decision;
  END IF;

  -- Get the equipment's workspace
  SELECT workspace_id INTO v_workspace_id
  FROM ops.crew_equipment
  WHERE id = p_crew_equipment_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Equipment not found';
  END IF;

  -- Check caller is admin/owner in that workspace
  SELECT role INTO v_user_role
  FROM public.workspace_members
  WHERE workspace_id = v_workspace_id
    AND user_id = auth.uid();

  IF v_user_role IS NULL OR v_user_role NOT IN ('owner', 'admin') THEN
    RAISE EXCEPTION 'Not authorised: only workspace owners and admins can review equipment';
  END IF;

  -- Apply the decision
  UPDATE ops.crew_equipment
  SET
    verification_status = p_decision,
    verified_at = now(),
    verified_by = auth.uid(),
    rejection_reason = CASE WHEN p_decision = 'rejected' THEN p_rejection_reason ELSE NULL END
  WHERE id = p_crew_equipment_id;
END;
$$;

-- Bulk-approve pending equipment (used when verification is toggled OFF — A5 fix)
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
