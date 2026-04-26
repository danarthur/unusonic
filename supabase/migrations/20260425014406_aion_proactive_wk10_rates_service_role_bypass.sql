-- Wk 10 follow-up: cortex.get_proactive_line_dismiss_rates was rewritten with
-- a workspace-member check that uses auth.uid(). Service-role callers (the
-- aion-proactive cron at src/app/api/cron/aion-proactive/evaluators.ts) have
-- auth.uid() = NULL and would fail the check silently, dropping the soft
-- (35%) auto-disable gate that's been in prod since pre-baseline.
--
-- Fix: skip the membership check when auth.uid() IS NULL (service-role).
-- Keep it for authenticated callers — anon is already REVOKEd, so NULL +
-- non-anon = service-role only. Safe.

CREATE OR REPLACE FUNCTION cortex.get_proactive_line_dismiss_rates(
  p_workspace_id uuid,
  p_window_days  integer DEFAULT 30,
  p_min_sample   integer DEFAULT 20
)
  RETURNS TABLE (
    signal_type        text,
    total_emitted      integer,
    total_dismissed    integer,
    not_useful_count   integer,
    already_handled    integer,
    dismiss_rate       numeric,
    not_useful_rate    numeric,
    hit_rate           numeric,
    above_threshold    boolean,
    would_auto_disable boolean
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
BEGIN
  -- Service-role (auth.uid() IS NULL) is trusted to pass workspace_id.
  -- Authenticated callers must be workspace members.
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a workspace member' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      l.signal_type AS sig,
      count(*) AS total,
      count(*) FILTER (WHERE l.dismissed_at IS NOT NULL) AS dismissed,
      count(*) FILTER (WHERE l.dismiss_reason = 'not_useful') AS not_useful,
      count(*) FILTER (WHERE l.dismiss_reason = 'already_handled') AS handled
    FROM cortex.aion_proactive_lines l
    WHERE l.workspace_id = p_workspace_id
      AND l.created_at >= now() - (p_window_days || ' days')::interval
    GROUP BY l.signal_type
  )
  SELECT
    b.sig::text,
    b.total::int,
    b.dismissed::int,
    b.not_useful::int,
    b.handled::int,
    CASE WHEN b.total > 0 THEN round(b.dismissed::numeric / b.total, 4) ELSE 0 END,
    CASE WHEN b.total > 0 THEN round(b.not_useful::numeric / b.total, 4) ELSE 0 END,
    CASE WHEN b.total > 0 THEN round(b.handled::numeric / b.total, 4) ELSE 0 END,
    (b.total >= p_min_sample
       AND (b.not_useful::numeric / NULLIF(b.total, 0)) > 0.35),
    (b.total >= 20
       AND (b.not_useful::numeric / NULLIF(b.total, 0)) > 0.80
       AND (b.handled::numeric / NULLIF(b.total, 0)) <= 0.40)
  FROM base b
  ORDER BY b.total DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION cortex.get_proactive_line_dismiss_rates(uuid, integer, integer) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION cortex.get_proactive_line_dismiss_rates(uuid, integer, integer) TO authenticated, service_role;

DO $$
DECLARE v_pub boolean; v_anon boolean;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'cortex.get_proactive_line_dismiss_rates(uuid, integer, integer)'::regprocedure;
  IF v_pub THEN
    RAISE EXCEPTION 'Safety audit: public still holds EXECUTE on cortex.get_proactive_line_dismiss_rates';
  END IF;

  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'cortex.get_proactive_line_dismiss_rates(uuid, integer, integer)'::regprocedure;
  IF v_anon THEN
    RAISE EXCEPTION 'Safety audit: anon still holds EXECUTE on cortex.get_proactive_line_dismiss_rates';
  END IF;
END $$;
