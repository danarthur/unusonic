-- =============================================================================
-- Replies Card v2 — snooze + "owed" override surface
--
-- Ships the schema surface the PR #20 UI needs. See
-- docs/reference/replies-card-v2-design.md for the full spec; this is the
-- thin DB layer supporting two new user affordances:
--
--   1. Snooze — per-thread dismissal until a future timestamp. Three options
--      in the UI (4h / Tomorrow / Next week) but the column holds an
--      arbitrary timestamptz so Phase 1.5 can add more granular options
--      without a schema change.
--
--   2. "Owed" override — Fork C from the design doc. The "owed" default is
--      heuristic (last message is inbound, <30d old, not auto-reply). The
--      override lets a workspace member correct false positives ("Thanks!"
--      that doesn't need a reply) or flag real ones the heuristic missed.
--      Three-state: NULL = use heuristic, TRUE = force owed, FALSE = force
--      not-owed. Workspace-wide for Phase 1 pilot — per-user override can
--      layer on in Phase 1.5 when crew scaling matters.
--
-- Read-path changes live in src/features/comms/replies/api/get-deal-replies.ts
-- (returns the derived `isOwed` + `snoozedUntil` per thread). This migration
-- only adds the columns + two small server-callable RPCs.
-- =============================================================================


-- =============================================================================
-- 1. Columns on ops.message_threads
-- =============================================================================

ALTER TABLE ops.message_threads
  ADD COLUMN IF NOT EXISTS snoozed_until          timestamptz,
  ADD COLUMN IF NOT EXISTS snoozed_by_user_id     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owed_override          boolean,
  ADD COLUMN IF NOT EXISTS owed_override_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS owed_override_at       timestamptz;

-- Help the owed-list query: threads not-snoozed where last message was
-- inbound. We don't have "last message direction" as a column on the thread,
-- so the card query joins LATERAL to ops.messages. This index accelerates
-- the snooze filter specifically.
CREATE INDEX IF NOT EXISTS idx_message_threads_snoozed
  ON ops.message_threads (deal_id, snoozed_until)
  WHERE snoozed_until IS NOT NULL;

COMMENT ON COLUMN ops.message_threads.snoozed_until IS
  'When set and > now(), the thread is hidden from the default "active" surface and visually muted in expanded views. When now() > snoozed_until, thread returns to normal.';

COMMENT ON COLUMN ops.message_threads.owed_override IS
  'Three-state override of the "owed" heuristic. NULL = use heuristic (last message inbound, <30d, not auto-reply). TRUE = always treat as owed (manual flag). FALSE = never treat as owed (dismiss false positives like "Thanks!"). See docs/reference/replies-card-v2-design.md §1.';


-- =============================================================================
-- 2. ops.snooze_thread — set snoozed_until on a thread
--
-- Callable from a workspace-member server action. Validates the thread
-- exists in the caller's workspace via get_my_workspace_ids(). Accepts NULL
-- to clear the snooze.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.snooze_thread(
  p_thread_id     uuid,
  p_snoozed_until timestamptz
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_caller_id     uuid := auth.uid();
  v_thread_ws_id  uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'snooze_thread: no authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT workspace_id INTO v_thread_ws_id
  FROM ops.message_threads
  WHERE id = p_thread_id;

  IF v_thread_ws_id IS NULL THEN
    RAISE EXCEPTION 'snooze_thread: thread % not found', p_thread_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Membership check.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_caller_id AND workspace_id = v_thread_ws_id
  ) THEN
    RAISE EXCEPTION 'snooze_thread: caller lacks workspace membership for thread %', p_thread_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE ops.message_threads
  SET snoozed_until       = p_snoozed_until,
      snoozed_by_user_id  = CASE WHEN p_snoozed_until IS NULL THEN NULL ELSE v_caller_id END
  WHERE id = p_thread_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.snooze_thread(uuid, timestamptz) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.snooze_thread(uuid, timestamptz) FROM anon;

COMMENT ON FUNCTION ops.snooze_thread(uuid, timestamptz) IS
  'Set or clear the snooze timestamp on a thread. Callable by any workspace member; no-ops cleanly when the caller lacks membership.';


-- =============================================================================
-- 3. ops.set_owed_override — set the manual override (Fork C)
--
-- Accepts three states via `p_override`:
--   NULL  — clear the override, revert to heuristic
--   TRUE  — force owed
--   FALSE — force not-owed
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.set_owed_override(
  p_thread_id uuid,
  p_override  boolean  -- NULL to clear
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_caller_id     uuid := auth.uid();
  v_thread_ws_id  uuid;
BEGIN
  IF v_caller_id IS NULL THEN
    RAISE EXCEPTION 'set_owed_override: no authenticated user'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  SELECT workspace_id INTO v_thread_ws_id
  FROM ops.message_threads
  WHERE id = p_thread_id;

  IF v_thread_ws_id IS NULL THEN
    RAISE EXCEPTION 'set_owed_override: thread % not found', p_thread_id
      USING ERRCODE = 'no_data_found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_caller_id AND workspace_id = v_thread_ws_id
  ) THEN
    RAISE EXCEPTION 'set_owed_override: caller lacks workspace membership for thread %', p_thread_id
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE ops.message_threads
  SET owed_override            = p_override,
      owed_override_by_user_id = CASE WHEN p_override IS NULL THEN NULL ELSE v_caller_id END,
      owed_override_at         = CASE WHEN p_override IS NULL THEN NULL ELSE now() END
  WHERE id = p_thread_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.set_owed_override(uuid, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.set_owed_override(uuid, boolean) FROM anon;

COMMENT ON FUNCTION ops.set_owed_override(uuid, boolean) IS
  'Set or clear the manual owed override on a thread. NULL clears (heuristic applies); TRUE forces owed; FALSE dismisses a false positive.';


-- =============================================================================
-- 4. Safety audit — no anon EXECUTE on the new RPCs
-- =============================================================================

DO $$
DECLARE
  v_leaky text;
BEGIN
  SELECT string_agg(proname, ', ')
  INTO v_leaky
  FROM pg_proc
  WHERE pronamespace = 'ops'::regnamespace
    AND prosecdef
    AND proname IN ('snooze_thread', 'set_owed_override')
    AND has_function_privilege('anon', oid, 'EXECUTE');

  IF v_leaky IS NOT NULL THEN
    RAISE EXCEPTION
      'Safety check failed: SECURITY DEFINER function(s) still executable by anon: %',
      v_leaky;
  END IF;
END $$;
