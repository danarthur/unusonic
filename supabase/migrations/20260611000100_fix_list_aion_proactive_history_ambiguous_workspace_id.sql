-- Fix ambiguous column reference in cortex.list_aion_proactive_history.
--
-- Bug: the function's RETURNS TABLE(...) signature includes an output column
-- named `workspace_id`, which PL/pgSQL puts in scope as a variable for the
-- whole function body. The workspace-membership guard's subquery referenced
-- the unqualified `workspace_id`, which Postgres can't resolve between the
-- public.workspace_members table column and that output-column variable —
-- raising `42702: column reference "workspace_id" is ambiguous` on EVERY call
-- that gets past the deal-found check. So pill-history reads
-- (src/app/(dashboard)/(features)/events/actions/proactive-line-actions.ts and
-- the AionDealCard history sheet) error out in prod instead of returning rows.
--
-- Fix: alias public.workspace_members and qualify its columns (wm.workspace_id,
-- wm.user_id). Body is otherwise identical to the deployed definition.
-- Caught by supabase/tests/database/01100-aion-cross-workspace-rls.test.sql
-- test 11 (cross-workspace caller must raise 42501 'not a workspace member',
-- not 42702).

CREATE OR REPLACE FUNCTION cortex.list_aion_proactive_history(p_deal_id uuid, p_days integer DEFAULT 14)
 RETURNS TABLE(id uuid, deal_id uuid, workspace_id uuid, signal_type text, headline text, artifact_ref jsonb, payload jsonb, created_at timestamptz, expires_at timestamptz, dismissed_at timestamptz, dismissed_by uuid, dismiss_reason text, resolved_at timestamptz, seen_at timestamptz, user_feedback text, feedback_at timestamptz)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT d.workspace_id INTO v_workspace_id
    FROM public.deals d WHERE d.id = p_deal_id;
  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'deal not found' USING ERRCODE = '42704';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = v_workspace_id AND wm.user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a workspace member' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    l.id, l.deal_id, l.workspace_id, l.signal_type, l.headline,
    l.artifact_ref, l.payload, l.created_at, l.expires_at,
    l.dismissed_at, l.dismissed_by, l.dismiss_reason, l.resolved_at,
    l.seen_at, l.user_feedback, l.feedback_at
  FROM cortex.aion_proactive_lines l
  WHERE l.deal_id    = p_deal_id
    AND l.created_at >= now() - (p_days || ' days')::interval
  ORDER BY l.created_at DESC;
END;
$function$;
