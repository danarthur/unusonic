-- Phase 3 Sprint 3 Wk 10 — Aion proactive lines: dismiss-reason taxonomy,
-- per-user 30-day mute, workspace-wide auto-disable, pill-history surface.
--
-- Decisions locked with Daniel:
--   D5 — three dismiss reasons: not_useful / already_handled / snooze
--   D6 — per-user mute on (signal_type, deal_id) after 3 not_useful in 7d → 30d
--   D7 — pill-history Sheet + 72h badge (Wk 10 client work)
--   D8 — workspace-wide disable on (signal_type) when total ≥20 in 30d AND
--        not_useful_rate > 80% AND already_handled_rate ≤ 40% → 30d
--   D8 notification — cessation school (Critic + Field Expert + UA-aligned).
--                     owner_notified_at stays NULL forever in Wk 10. The Sheet's
--                     muted-reason strip is the entire UX. No emit to
--                     cortex.aion_insights, no toast, no email. Forward-compat
--                     hook left in case Wk 11+ pilot data argues for a whisper.
--
-- Schema reality verified 2026-04-24 against prod:
--   - cortex.aion_proactive_lines uses payload (jsonb), no metadata column,
--     no status column. Activity = dismissed_at IS NULL AND resolved_at IS NULL
--     AND expires_at > now(). All landmines from the kickoff handoff confirmed.
--   - existing dismiss_aion_proactive_line(uuid)→bool; signature changes here.
--   - existing get_proactive_line_dismiss_rates returns 5 cols; adds hit_rate
--     and would_auto_disable.
--
-- All new SECURITY DEFINER functions REVOKE EXECUTE FROM PUBLIC, anon and
-- GRANT to authenticated + service_role explicitly. Safety-audit DO block at
-- the bottom fails the migration if grants drift open.

-- ---------------------------------------------------------------------------
-- 1. Column additions on cortex.aion_proactive_lines
-- ---------------------------------------------------------------------------

ALTER TABLE cortex.aion_proactive_lines
  ADD COLUMN dismiss_reason text
    CHECK (dismiss_reason IS NULL OR dismiss_reason IN ('not_useful','already_handled','snooze')),
  ADD COLUMN soonest_redeliver_at timestamptz,
  ADD COLUMN seen_at timestamptz,
  ADD COLUMN seen_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  ADD COLUMN user_feedback text
    CHECK (user_feedback IS NULL OR user_feedback IN ('useful','not_useful')),
  ADD COLUMN feedback_at timestamptz,
  ADD COLUMN feedback_by uuid REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN cortex.aion_proactive_lines.dismiss_reason IS
  'D5 — three-reason dismissal taxonomy. Owner-facing UI shows '
  '"Not relevant"/"Already did it"/"Ask me later" but storage is the telemetry '
  'field name. NULL on dismissals predating Wk 10.';

COMMENT ON COLUMN cortex.aion_proactive_lines.soonest_redeliver_at IS
  'C3 — snooze floor, never bypass. When dismiss_reason=snooze, set to '
  'now()+24h. Evaluators must not re-emit before this time. All other '
  'proactive gates (quiet hours, kill switch, throttle) still apply on top.';

COMMENT ON COLUMN cortex.aion_proactive_lines.seen_at IS
  'D7 — when the owner viewed the pill (pinned-pill render OR explicit '
  'mark-seen). Drives the 72h badge unseen count.';

-- ---------------------------------------------------------------------------
-- 2. Partial index for badge count — D7 unseen-per-deal lookup.
--
-- Note: expires_at > now() can't live in the predicate (volatile fn). Pulling
-- expires_at into the index columns gives the planner the same selectivity
-- with a legal index. Predicate covers the static unseen+active fields.
-- ---------------------------------------------------------------------------

CREATE INDEX aion_proactive_lines_unseen_per_deal_idx
  ON cortex.aion_proactive_lines (deal_id, expires_at DESC)
  WHERE dismissed_at IS NULL
    AND resolved_at IS NULL
    AND seen_at IS NULL;

-- ---------------------------------------------------------------------------
-- 3. cortex.aion_user_signal_mutes — D6 per-user tuple mute.
--
-- One row per (user_id, workspace_id, signal_type, deal_id). Inserted by the
-- inline D6 check inside dismiss_aion_proactive_line when the caller has
-- dismissed the same tuple with not_useful 3x in 7 days. Read at pill-render
-- and badge-count time via cortex.is_user_signal_muted.
--
-- RLS enabled, no client policies — all access via SECURITY DEFINER RPCs
-- (cortex write-protection rule). No INSERT/UPDATE/DELETE policies; SELECT
-- policy via the RPCs themselves running as definer.
-- ---------------------------------------------------------------------------

CREATE TABLE cortex.aion_user_signal_mutes (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id                uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  workspace_id           uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  signal_type            text NOT NULL,
  deal_id                uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  muted_until            timestamptz NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  trigger_dismissal_ids  uuid[] NOT NULL DEFAULT '{}',
  UNIQUE (user_id, workspace_id, signal_type, deal_id)
);

CREATE INDEX aion_user_signal_mutes_active_idx
  ON cortex.aion_user_signal_mutes (user_id, signal_type, deal_id, muted_until);

ALTER TABLE cortex.aion_user_signal_mutes ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cortex.aion_user_signal_mutes IS
  'D6 — per-user mute on a (signal_type, deal_id) tuple. Inserted inline by '
  'cortex.dismiss_aion_proactive_line after 3 not_useful in 7d on same tuple. '
  'Read by cortex.is_user_signal_muted at pill-render time. RLS enabled, no '
  'client policies — all access via SECURITY DEFINER RPCs.';

-- ---------------------------------------------------------------------------
-- 4. cortex.aion_workspace_signal_disables — D8 workspace-wide disable.
--
-- One row per (workspace_id, signal_type). Inserted by the inline D8 check
-- inside dismiss_aion_proactive_line. Read by cortex.check_signal_disabled
-- at evaluator pre-emit time.
--
-- Cessation school: owner_notified_at exists as a forward-compat hook but is
-- never written in Wk 10 — no notification side-effect. The Sheet's
-- muted-reason strip is the entire UX surface.
-- ---------------------------------------------------------------------------

CREATE TABLE cortex.aion_workspace_signal_disables (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id        uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  signal_type         text NOT NULL,
  disabled_until      timestamptz NOT NULL,
  fires_sampled       integer NOT NULL,
  not_useful_count    integer NOT NULL,
  hit_rate            numeric(5,4) NOT NULL,
  triggered_by        uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  owner_notified_at   timestamptz,
  created_at          timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, signal_type)
);

CREATE INDEX aion_workspace_signal_disables_active_idx
  ON cortex.aion_workspace_signal_disables (workspace_id, signal_type, disabled_until);

ALTER TABLE cortex.aion_workspace_signal_disables ENABLE ROW LEVEL SECURITY;

COMMENT ON TABLE cortex.aion_workspace_signal_disables IS
  'D8 — workspace-wide auto-disable for a signal_type when total ≥20 in 30d '
  'AND not_useful_rate > 80% AND already_handled_rate ≤ 40%. Cessation school: '
  'owner_notified_at left NULL — no proactive notice in Wk 10. Resurface via '
  'cortex.resurface_muted_reason. RLS enabled, no client policies.';

-- ---------------------------------------------------------------------------
-- 5. cortex.dismiss_aion_proactive_line — DROP + CREATE (signature change).
--
-- New required arg p_reason. Inline D6 (per-user mute) and D8 (workspace
-- disable) checks land here. Snooze stamps soonest_redeliver_at = now()+24h.
-- ---------------------------------------------------------------------------

-- Drop the legacy 1-arg signature; the new 2-arg signature with a default on
-- p_reason absorbs old 1-arg calls during the migration→Vercel-deploy window
-- (PostgREST honors function defaults). Default is 'already_handled' — the
-- most conservative fallback: does not feed D6 or D8 mute math, so stale
-- browser tabs in the deploy window cannot trigger a spurious auto-disable.
-- A Wk 11 cleanup migration will drop the default once stale-tab traffic ≈ 0.

DROP FUNCTION IF EXISTS cortex.dismiss_aion_proactive_line(uuid);

CREATE OR REPLACE FUNCTION cortex.dismiss_aion_proactive_line(
  p_line_id uuid,
  p_reason  text DEFAULT 'already_handled'
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
  -- Validate reason at the boundary.
  IF p_reason NOT IN ('not_useful','already_handled','snooze') THEN
    RAISE EXCEPTION 'invalid dismiss_reason: %', p_reason
      USING ERRCODE = '22023';
  END IF;

  -- Load line; bail cleanly if missing or already dismissed (false = no-op).
  SELECT * INTO v_line FROM cortex.aion_proactive_lines WHERE id = p_line_id;
  IF NOT FOUND OR v_line.dismissed_at IS NOT NULL THEN
    RETURN false;
  END IF;

  -- Caller must be a workspace member.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = v_line.workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a workspace member' USING ERRCODE = '42501';
  END IF;

  -- Stamp dismissal — for snooze, also set the 24h floor (C3).
  UPDATE cortex.aion_proactive_lines
     SET dismissed_at         = now(),
         dismissed_by         = auth.uid(),
         dismiss_reason       = p_reason,
         soonest_redeliver_at = CASE
           WHEN p_reason = 'snooze' THEN now() + interval '24 hours'
           ELSE soonest_redeliver_at
         END
   WHERE id = p_line_id;

  -- D6 + D8 only fire on not_useful. already_handled and snooze are not
  -- negative signal — they don't tune mutes.
  IF p_reason = 'not_useful' THEN
    -- D6: count caller's not_useful dismissals on this exact tuple in 7d
    -- (current dismissal already stamped above, so it's included in the count).
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

    -- D8: workspace-wide aggregate over 30d on this signal_type.
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
  'Wk 10 D5/D6/D8. Stamps dismissal with reason, applies snooze floor, runs '
  'inline D6 (per-user 30d tuple mute after 3 not_useful in 7d) and D8 '
  '(workspace 30d disable when ≥20 fires in 30d AND not_useful_rate>80% AND '
  'already_handled_rate≤40%). Cessation school for D8 — no notification '
  'side-effect; Sheet strip is the surface. p_reason defaults to '
  'already_handled to absorb stale 1-arg calls in the deploy window without '
  'feeding mute math; Wk 11 drops the default.';

-- ---------------------------------------------------------------------------
-- 6. cortex.get_proactive_line_dismiss_rates — DROP + CREATE (return-shape change).
--
-- Adds hit_rate and would_auto_disable columns. Filters not_useful only for
-- dismiss math. Useful for telemetry / admin dashboards (D13 future scope).
-- ---------------------------------------------------------------------------

DROP FUNCTION IF EXISTS cortex.get_proactive_line_dismiss_rates(uuid, integer, integer);

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
  IF NOT EXISTS (
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

COMMENT ON FUNCTION cortex.get_proactive_line_dismiss_rates(uuid, integer, integer) IS
  'Wk 10 C4 rewrite. Returns per-signal dismissal stats over a configurable '
  'window. above_threshold = legacy 35% gate (kept for backwards compat). '
  'would_auto_disable = D8 condition (≥20 + >80% not_useful + ≤40% hit_rate). '
  'Workspace-member-gated.';

-- ---------------------------------------------------------------------------
-- 7. cortex.check_signal_disabled — evaluator pre-emit gate (workspace-only).
--
-- Service-role caller. Returns TRUE when an active aion_workspace_signal_disables
-- row exists for the (workspace, signal_type). Per-user mutes are NOT checked
-- here — pills are workspace-shared at write time; per-user filtering happens
-- at read time via cortex.is_user_signal_muted.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.check_signal_disabled(
  p_workspace_id uuid,
  p_signal_type  text
)
  RETURNS boolean
  LANGUAGE sql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1 FROM cortex.aion_workspace_signal_disables
     WHERE workspace_id   = p_workspace_id
       AND signal_type    = p_signal_type
       AND disabled_until > now()
  );
$function$;

COMMENT ON FUNCTION cortex.check_signal_disabled(uuid, text) IS
  'Wk 10 D8 gate. Evaluator pre-emit — returns TRUE when this signal_type is '
  'workspace-disabled. Service-role context; does not check per-user mutes.';

-- ---------------------------------------------------------------------------
-- 8. cortex.is_user_signal_muted — auth-context per-user gate.
--
-- Uses auth.uid(). Returns TRUE when the caller has an active mute for the
-- (signal_type, deal_id) tuple OR the workspace has an active disable for
-- this signal_type. Called at pill render and badge-count time.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.is_user_signal_muted(
  p_signal_type text,
  p_deal_id     uuid
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
  SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;

  SELECT workspace_id INTO v_workspace_id
    FROM public.deals WHERE id = p_deal_id;
  IF v_workspace_id IS NULL THEN
    RETURN false;
  END IF;

  -- Workspace-disable trumps per-user.
  IF EXISTS (
    SELECT 1 FROM cortex.aion_workspace_signal_disables
     WHERE workspace_id   = v_workspace_id
       AND signal_type    = p_signal_type
       AND disabled_until > now()
  ) THEN
    RETURN true;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM cortex.aion_user_signal_mutes
     WHERE user_id     = auth.uid()
       AND workspace_id = v_workspace_id
       AND signal_type = p_signal_type
       AND deal_id     = p_deal_id
       AND muted_until > now()
  );
END;
$function$;

COMMENT ON FUNCTION cortex.is_user_signal_muted(text, uuid) IS
  'Wk 10 D6+D8. Auth-context gate — TRUE when the caller has an active per-user '
  'mute on (signal_type, deal_id) OR the workspace has an active disable for '
  'signal_type. Called from pill render and badge count paths.';

-- ---------------------------------------------------------------------------
-- 9. cortex.list_aion_proactive_history — pill-history Sheet feed.
--
-- Returns active + dismissed + resolved pills for the deal in the window.
-- Workspace-membership gated. Ordered created_at DESC.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.list_aion_proactive_history(
  p_deal_id uuid,
  p_days    integer DEFAULT 14
)
  RETURNS TABLE (
    id              uuid,
    deal_id         uuid,
    workspace_id    uuid,
    signal_type     text,
    headline        text,
    artifact_ref    jsonb,
    payload         jsonb,
    created_at      timestamptz,
    expires_at      timestamptz,
    dismissed_at    timestamptz,
    dismissed_by    uuid,
    dismiss_reason  text,
    resolved_at     timestamptz,
    seen_at         timestamptz,
    user_feedback   text,
    feedback_at     timestamptz
  )
  LANGUAGE plpgsql
  SECURITY DEFINER
  STABLE
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
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = v_workspace_id AND user_id = auth.uid()
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

COMMENT ON FUNCTION cortex.list_aion_proactive_history(uuid, integer) IS
  'Wk 10 D7. Pill-history Sheet feed — returns active+dismissed+resolved pills '
  'for the deal in the window, ordered created_at DESC. Workspace-member gated.';

-- ---------------------------------------------------------------------------
-- 10. cortex.mark_pill_seen — auth-context, stamps seen_at + seen_by.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.mark_pill_seen(p_line_id uuid)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
    FROM cortex.aion_proactive_lines WHERE id = p_line_id;
  IF v_workspace_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = v_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a workspace member' USING ERRCODE = '42501';
  END IF;

  -- Idempotent — first stamp wins, subsequent calls are no-ops.
  UPDATE cortex.aion_proactive_lines
     SET seen_at = COALESCE(seen_at, now()),
         seen_by = COALESCE(seen_by, auth.uid())
   WHERE id = p_line_id;
  RETURN true;
END;
$function$;

COMMENT ON FUNCTION cortex.mark_pill_seen(uuid) IS
  'Wk 10 D7. Stamps seen_at + seen_by. Idempotent — first stamp wins. Called '
  'on pinned-pill render and explicit history-row view (Q2 resolution).';

-- ---------------------------------------------------------------------------
-- 11. cortex.submit_pill_feedback — auth-context, stamps user_feedback.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.submit_pill_feedback(
  p_line_id  uuid,
  p_feedback text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
DECLARE
  v_workspace_id uuid;
BEGIN
  IF p_feedback NOT IN ('useful','not_useful') THEN
    RAISE EXCEPTION 'invalid feedback: %', p_feedback USING ERRCODE = '22023';
  END IF;

  SELECT workspace_id INTO v_workspace_id
    FROM cortex.aion_proactive_lines WHERE id = p_line_id;
  IF v_workspace_id IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = v_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a workspace member' USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_proactive_lines
     SET user_feedback = p_feedback,
         feedback_at   = now(),
         feedback_by   = auth.uid()
   WHERE id = p_line_id;
  RETURN true;
END;
$function$;

COMMENT ON FUNCTION cortex.submit_pill_feedback(uuid, text) IS
  'Wk 10 D7. Per-row useful/not_useful feedback chip. Last write wins '
  '(owner can flip their mind). Does not feed D6 — that is dismissals only.';

-- ---------------------------------------------------------------------------
-- 12. cortex.resurface_muted_reason — owner Resurface action.
--
-- Removes the workspace_signal_disables row AND the caller's user_signal_mutes
-- rows for this signal_type in this workspace. Other users' mutes survive.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.resurface_muted_reason(
  p_workspace_id uuid,
  p_signal_type  text
)
  RETURNS boolean
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'pg_catalog', 'cortex', 'public'
AS $function$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id AND user_id = auth.uid()
  ) THEN
    RAISE EXCEPTION 'not a workspace member' USING ERRCODE = '42501';
  END IF;

  DELETE FROM cortex.aion_workspace_signal_disables
   WHERE workspace_id = p_workspace_id
     AND signal_type  = p_signal_type;

  DELETE FROM cortex.aion_user_signal_mutes
   WHERE workspace_id = p_workspace_id
     AND signal_type  = p_signal_type
     AND user_id      = auth.uid();

  RETURN true;
END;
$function$;

COMMENT ON FUNCTION cortex.resurface_muted_reason(uuid, text) IS
  'Wk 10 D7. Owner-initiated Resurface from the pill-history Sheet strip. '
  'Drops workspace-disable + caller''s per-user mutes for the signal_type. '
  'Other users'' mutes are not touched.';

-- ---------------------------------------------------------------------------
-- Grants — REVOKE PUBLIC/anon, GRANT authenticated + service_role.
-- ---------------------------------------------------------------------------

REVOKE EXECUTE ON FUNCTION cortex.dismiss_aion_proactive_line(uuid, text)        FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cortex.get_proactive_line_dismiss_rates(uuid, integer, integer) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cortex.check_signal_disabled(uuid, text)              FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cortex.is_user_signal_muted(text, uuid)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cortex.list_aion_proactive_history(uuid, integer)     FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cortex.mark_pill_seen(uuid)                           FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cortex.submit_pill_feedback(uuid, text)               FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION cortex.resurface_muted_reason(uuid, text)             FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION cortex.dismiss_aion_proactive_line(uuid, text)        TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cortex.get_proactive_line_dismiss_rates(uuid, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cortex.check_signal_disabled(uuid, text)              TO service_role;
GRANT EXECUTE ON FUNCTION cortex.is_user_signal_muted(text, uuid)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cortex.list_aion_proactive_history(uuid, integer)     TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cortex.mark_pill_seen(uuid)                           TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cortex.submit_pill_feedback(uuid, text)               TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION cortex.resurface_muted_reason(uuid, text)             TO authenticated, service_role;

-- Note: cortex.check_signal_disabled is service_role-only by intent — it's
-- the evaluator pre-emit gate. authenticated callers go through
-- is_user_signal_muted instead, which checks both halves of the gate.

-- ---------------------------------------------------------------------------
-- Safety audit — fail the migration if any new function still has open grants
-- to public/anon, and confirm RLS is enabled on the two new tables.
-- ---------------------------------------------------------------------------

DO $$
DECLARE
  v_proc record;
  v_pub  boolean;
  v_anon boolean;
  v_rls  boolean;
  v_funcs text[] := ARRAY[
    'dismiss_aion_proactive_line',
    'get_proactive_line_dismiss_rates',
    'check_signal_disabled',
    'is_user_signal_muted',
    'list_aion_proactive_history',
    'mark_pill_seen',
    'submit_pill_feedback',
    'resurface_muted_reason'
  ];
BEGIN
  FOR v_proc IN
    SELECT p.oid, p.proname
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'cortex'
       AND p.proname = ANY(v_funcs)
  LOOP
    SELECT has_function_privilege('public', v_proc.oid, 'EXECUTE') INTO v_pub;
    IF v_pub THEN
      RAISE EXCEPTION 'Safety audit: public still holds EXECUTE on cortex.%', v_proc.proname;
    END IF;
    SELECT has_function_privilege('anon', v_proc.oid, 'EXECUTE') INTO v_anon;
    IF v_anon THEN
      RAISE EXCEPTION 'Safety audit: anon still holds EXECUTE on cortex.%', v_proc.proname;
    END IF;
  END LOOP;

  -- RLS enabled on both new tables.
  SELECT relrowsecurity INTO v_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'cortex' AND c.relname = 'aion_user_signal_mutes';
  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'Safety audit: RLS not enabled on cortex.aion_user_signal_mutes';
  END IF;

  SELECT relrowsecurity INTO v_rls
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
   WHERE n.nspname = 'cortex' AND c.relname = 'aion_workspace_signal_disables';
  IF NOT COALESCE(v_rls, false) THEN
    RAISE EXCEPTION 'Safety audit: RLS not enabled on cortex.aion_workspace_signal_disables';
  END IF;
END $$;
