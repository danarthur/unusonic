-- Wk 11 cleanup of Wk 10's deploy-window mitigation.
--
-- The Wk 10 dismiss-trio rollout dropped the legacy 1-arg
-- cortex.dismiss_aion_proactive_line(uuid) and replaced it with a 2-arg
-- (uuid, text) variant. p_reason was given a DEFAULT 'already_handled' so
-- stale browser tabs in the migration→Vercel-deploy window would absorb
-- old 1-arg calls without erroring (and without feeding D6/D8 mute math —
-- already_handled is the most conservative reason).
--
-- Vercel deploys for `de9ff5c` and `4409f14` propagated cleanly, so any tab
-- still alive that skipped the new bundle has been refreshed by now.
-- Dropping the default tightens the contract: every call must pass a
-- reason explicitly. The function body is unchanged.
--
-- Postgres requires DROP+CREATE (CREATE OR REPLACE rejects "remove default"
-- as a signature change). The txn is atomic; no observable window where the
-- function is missing.

DROP FUNCTION IF EXISTS cortex.dismiss_aion_proactive_line(uuid, text);

CREATE OR REPLACE FUNCTION cortex.dismiss_aion_proactive_line(
  p_line_id uuid,
  p_reason  text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
DECLARE
  v_line                cortex.aion_proactive_lines%ROWTYPE;
  v_user_dismiss_count  int;
  v_ws_total            int;
  v_ws_not_useful       int;
  v_ws_already_handled  int;
BEGIN
  IF p_reason NOT IN ('not_useful','already_handled','snooze') THEN
    RAISE EXCEPTION 'invalid dismiss_reason: %', p_reason USING ERRCODE = '22023';
  END IF;

  SELECT * INTO v_line FROM cortex.aion_proactive_lines WHERE id = p_line_id;
  IF NOT FOUND OR v_line.dismissed_at IS NOT NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = v_line.workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a workspace member' USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_proactive_lines
     SET dismissed_at         = now(),
         dismissed_by         = auth.uid(),
         dismiss_reason       = p_reason,
         soonest_redeliver_at = CASE
           WHEN p_reason = 'snooze' THEN now() + interval '24 hours'
           ELSE soonest_redeliver_at
         END
   WHERE id = p_line_id;

  IF p_reason = 'not_useful' THEN
    SELECT count(*) INTO v_user_dismiss_count
      FROM cortex.aion_proactive_lines
     WHERE workspace_id    = v_line.workspace_id
       AND deal_id         = v_line.deal_id
       AND signal_type     = v_line.signal_type
       AND dismissed_by    = auth.uid()
       AND dismiss_reason  = 'not_useful'
       AND dismissed_at   >= now() - interval '7 days';

    IF v_user_dismiss_count >= 3 THEN
      INSERT INTO cortex.aion_user_signal_mutes (
        user_id, workspace_id, signal_type, deal_id,
        muted_until, trigger_dismissal_ids
      )
      VALUES (
        auth.uid(), v_line.workspace_id, v_line.signal_type, v_line.deal_id,
        now() + interval '30 days', ARRAY[p_line_id]
      )
      ON CONFLICT (user_id, workspace_id, signal_type, deal_id)
      DO UPDATE SET
        muted_until           = now() + interval '30 days',
        trigger_dismissal_ids = aion_user_signal_mutes.trigger_dismissal_ids
                                  || ARRAY[p_line_id];
    END IF;

    SELECT
      count(*),
      count(*) FILTER (WHERE dismiss_reason = 'not_useful'),
      count(*) FILTER (WHERE dismiss_reason = 'already_handled')
      INTO v_ws_total, v_ws_not_useful, v_ws_already_handled
      FROM cortex.aion_proactive_lines
     WHERE workspace_id = v_line.workspace_id
       AND signal_type  = v_line.signal_type
       AND created_at  >= now() - interval '30 days';

    IF v_ws_total >= 20
       AND (v_ws_not_useful::numeric / v_ws_total) > 0.80
       AND (v_ws_already_handled::numeric / v_ws_total) <= 0.40
    THEN
      INSERT INTO cortex.aion_workspace_signal_disables (
        workspace_id, signal_type, disabled_until,
        fires_sampled, not_useful_count, hit_rate, triggered_by
      )
      VALUES (
        v_line.workspace_id, v_line.signal_type, now() + interval '30 days',
        v_ws_total, v_ws_not_useful,
        round((v_ws_already_handled::numeric / v_ws_total)::numeric, 4),
        auth.uid()
      )
      ON CONFLICT (workspace_id, signal_type)
      DO UPDATE SET
        disabled_until    = now() + interval '30 days',
        fires_sampled     = EXCLUDED.fires_sampled,
        not_useful_count  = EXCLUDED.not_useful_count,
        hit_rate          = EXCLUDED.hit_rate,
        triggered_by      = EXCLUDED.triggered_by;
    END IF;
  END IF;

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION cortex.dismiss_aion_proactive_line(uuid, text) IS
  'Wk 10 D5/D6/D8. Stamps dismissal with reason, applies snooze floor, runs inline D6 + D8. Cessation school for D8. Wk 11: p_reason DEFAULT dropped now that the deploy-window grace period for stale 1-arg callers is over. Every call must pass an explicit reason.';

REVOKE EXECUTE ON FUNCTION cortex.dismiss_aion_proactive_line(uuid, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION cortex.dismiss_aion_proactive_line(uuid, text) TO authenticated, service_role;

DO $$
DECLARE v_pub boolean; v_anon boolean; v_default_count int;
BEGIN
  SELECT has_function_privilege('public', oid, 'EXECUTE') INTO v_pub
    FROM pg_proc WHERE oid = 'cortex.dismiss_aion_proactive_line(uuid, text)'::regprocedure;
  IF v_pub THEN
    RAISE EXCEPTION 'Safety audit: public still holds EXECUTE on cortex.dismiss_aion_proactive_line';
  END IF;

  SELECT has_function_privilege('anon', oid, 'EXECUTE') INTO v_anon
    FROM pg_proc WHERE oid = 'cortex.dismiss_aion_proactive_line(uuid, text)'::regprocedure;
  IF v_anon THEN
    RAISE EXCEPTION 'Safety audit: anon still holds EXECUTE on cortex.dismiss_aion_proactive_line';
  END IF;

  -- Confirm the default actually went away.
  SELECT pronargdefaults INTO v_default_count
    FROM pg_proc WHERE oid = 'cortex.dismiss_aion_proactive_line(uuid, text)'::regprocedure;
  IF v_default_count <> 0 THEN
    RAISE EXCEPTION 'Safety audit: dismiss_aion_proactive_line still has % default(s) — Wk 11 cleanup did not take', v_default_count;
  END IF;
END $$;
