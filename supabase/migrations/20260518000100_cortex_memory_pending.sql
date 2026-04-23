-- =============================================================================
-- cortex.memory_pending — embedding ingestion queue
-- Phase 3 Sprint 1 Week 2. Plan §3.2 B2.
--
-- Purpose. When the Postmark webhook (or the send-reply action) commits a
-- new ops.messages row, we don't block the 200 OK on Voyage. Instead we
-- enqueue a row here inside the same transaction; a 2-minute cron drains
-- it, calls upsertEmbedding(), and deletes on success. Failure modes:
--
--   • Voyage rate-limit / outage → attempts++, exponential backoff
--     (2/4/8/16/32/64 min). After 6 attempts, row stays for manual retry
--     + Sentry alert.
--   • Postmark retries → blocked twice: (a) ops.messages.provider_message_id
--     UNIQUE blocks the duplicate ops.messages insert; (b) memory_pending's
--     UNIQUE (source_type, source_id) blocks duplicate enqueues.
--   • Webhook cold shutdown → row committed before 200; worst-case
--     ingestion-to-searchable window is 4 min (2 min cron + 2 min Voyage).
--
-- Why a separate queue table (vs Vercel waitUntil or a live embed call).
-- Plan §3.2 decision B2: burst tolerance. Postmark can deliver 10+ replies
-- in seconds during a storm, saturating a free-tier Voyage key (S0-6).
-- A queue absorbs the spike and the drain cron serialises against the
-- rate limit. waitUntil() was considered but dies if the serverless
-- runtime cold-shuts before it completes.
--
-- No RLS for authenticated callers — this is internal plumbing, service
-- role only (the drain cron + the enqueue RPC both run as service role).
-- =============================================================================

CREATE TABLE cortex.memory_pending (
  id                 uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  -- Matches cortex.memory.source_type — shares the whitelist CHECK from
  -- migration 20260517000100.
  source_type        text        NOT NULL CHECK (
    source_type IN (
      'deal_note','follow_up','proposal','event_note',
      'capture','message','narrative','activity_log','catalog'
    )
  ),
  source_id          uuid        NOT NULL,
  content_text       text        NOT NULL,
  content_header     text,
  entity_ids         uuid[]      NOT NULL DEFAULT '{}',
  metadata           jsonb       NOT NULL DEFAULT '{}'::jsonb,
  enqueued_at        timestamptz NOT NULL DEFAULT now(),
  attempts           int         NOT NULL DEFAULT 0,
  last_attempted_at  timestamptz,
  last_error         text,
  next_attempt_after timestamptz NOT NULL DEFAULT now(),
  -- Idempotency — if the same source row is enqueued twice (webhook retry,
  -- manual backfill re-run), the later caller is a no-op.
  UNIQUE (source_type, source_id)
);

COMMENT ON TABLE cortex.memory_pending IS
  'Embedding ingestion queue. Rows inserted by ops.messages write paths and drained every 2 min by /api/cron/aion-memory-drain. On success row deletes; on failure attempts++ with exponential backoff.';

CREATE INDEX memory_pending_drain_idx
  ON cortex.memory_pending (next_attempt_after)
  WHERE attempts < 6;

CREATE INDEX memory_pending_stuck_idx
  ON cortex.memory_pending (attempts, last_attempted_at DESC)
  WHERE attempts >= 6;

ALTER TABLE cortex.memory_pending ENABLE ROW LEVEL SECURITY;

-- No policies — no authenticated caller ever reads this table directly.
-- Service role bypasses RLS for drain + enqueue.
GRANT SELECT, INSERT, UPDATE, DELETE ON cortex.memory_pending TO service_role;


-- =============================================================================
-- cortex.enqueue_memory_pending
--
-- Called by ops.messages write paths (Postmark webhook, send-reply). Safe to
-- call from any schema boundary — SECURITY DEFINER. Service-role only.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.enqueue_memory_pending(
  p_workspace_id    uuid,
  p_source_type     text,
  p_source_id       uuid,
  p_content_text    text,
  p_content_header  text DEFAULT NULL,
  p_entity_ids      uuid[] DEFAULT '{}',
  p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO cortex.memory_pending (
    workspace_id, source_type, source_id, content_text, content_header,
    entity_ids, metadata
  )
  VALUES (
    p_workspace_id, p_source_type, p_source_id, p_content_text, p_content_header,
    p_entity_ids, p_metadata
  )
  ON CONFLICT (source_type, source_id) DO UPDATE SET
    -- Idempotent re-enqueue: refresh the payload in case upstream content
    -- changed between the first enqueue and the drain picking it up.
    content_text = EXCLUDED.content_text,
    content_header = EXCLUDED.content_header,
    entity_ids = EXCLUDED.entity_ids,
    metadata = EXCLUDED.metadata,
    -- Reset the backoff so the updated payload gets retried promptly.
    attempts = 0,
    next_attempt_after = now(),
    last_error = NULL,
    last_attempted_at = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION cortex.enqueue_memory_pending IS
  'Service-role-only enqueue path. Upserts on (source_type, source_id) so webhook retries + content updates converge without duplicate rows.';

REVOKE EXECUTE ON FUNCTION cortex.enqueue_memory_pending(uuid, text, uuid, text, text, uuid[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cortex.enqueue_memory_pending(uuid, text, uuid, text, text, uuid[], jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION cortex.enqueue_memory_pending(uuid, text, uuid, text, text, uuid[], jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION cortex.enqueue_memory_pending(uuid, text, uuid, text, text, uuid[], jsonb) TO service_role;


-- =============================================================================
-- cortex.claim_memory_pending_batch
--
-- Pops up to `p_limit` rows that are due (next_attempt_after <= now()) and
-- not yet over the attempt ceiling. Uses SELECT ... FOR UPDATE SKIP LOCKED
-- so two cron instances can't double-process the same row. Callers MUST
-- call mark_memory_pending_result() for each claimed row.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.claim_memory_pending_batch(
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id             uuid,
  workspace_id   uuid,
  source_type    text,
  source_id      uuid,
  content_text   text,
  content_header text,
  entity_ids     uuid[],
  metadata       jsonb,
  attempts       int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex
AS $$
BEGIN
  RETURN QUERY
    UPDATE cortex.memory_pending p
    SET last_attempted_at = now(),
        attempts = p.attempts + 1
    WHERE p.id IN (
      SELECT q.id
      FROM cortex.memory_pending q
      WHERE q.next_attempt_after <= now()
        AND q.attempts < 6
      ORDER BY q.enqueued_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      p.id, p.workspace_id, p.source_type, p.source_id,
      p.content_text, p.content_header, p.entity_ids, p.metadata,
      p.attempts;
END;
$$;

COMMENT ON FUNCTION cortex.claim_memory_pending_batch IS
  'Atomic claim-and-increment for the drain cron. SKIP LOCKED makes concurrent drains safe. attempts is bumped up front so a mid-handler crash still counts the attempt.';

REVOKE EXECUTE ON FUNCTION cortex.claim_memory_pending_batch(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cortex.claim_memory_pending_batch(int) FROM anon;
REVOKE EXECUTE ON FUNCTION cortex.claim_memory_pending_batch(int) FROM authenticated;
GRANT  EXECUTE ON FUNCTION cortex.claim_memory_pending_batch(int) TO service_role;


-- =============================================================================
-- cortex.mark_memory_pending_result
--
-- Called by the drain cron after each upsert. Status='success' → delete row.
-- Status='failure' → compute next exponential-backoff target (2/4/8/16/32/
-- 64 minutes by attempt count) and record the error. After 6 failed
-- attempts, the row stays in the queue for a human. The drain cron skips
-- rows with attempts>=6 via the WHERE clause in claim_memory_pending_batch.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.mark_memory_pending_result(
  p_id      uuid,
  p_status  text,              -- 'success' | 'failure'
  p_error   text DEFAULT NULL  -- only relevant on failure
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex
AS $$
DECLARE
  v_attempts int;
  v_backoff_min int;
BEGIN
  IF p_status = 'success' THEN
    DELETE FROM cortex.memory_pending WHERE id = p_id;
    RETURN;
  END IF;

  IF p_status <> 'failure' THEN
    RAISE EXCEPTION 'mark_memory_pending_result: status must be success or failure';
  END IF;

  SELECT attempts INTO v_attempts FROM cortex.memory_pending WHERE id = p_id;
  IF v_attempts IS NULL THEN
    RETURN; -- row already deleted
  END IF;

  -- Exponential backoff: attempt 1 → 2 min, 2 → 4, 3 → 8, 4 → 16, 5 → 32,
  -- 6 → 64. Capped at 60 minutes to keep drift bounded.
  v_backoff_min := LEAST(64, POWER(2, v_attempts)::int);

  UPDATE cortex.memory_pending
  SET next_attempt_after = now() + (v_backoff_min || ' minutes')::interval,
      last_error         = p_error
  WHERE id = p_id;
END;
$$;

COMMENT ON FUNCTION cortex.mark_memory_pending_result IS
  'Drain-cron callback. success deletes; failure backs off exponentially up to 6 attempts, then freezes the row for manual recovery.';

REVOKE EXECUTE ON FUNCTION cortex.mark_memory_pending_result(uuid, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cortex.mark_memory_pending_result(uuid, text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION cortex.mark_memory_pending_result(uuid, text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION cortex.mark_memory_pending_result(uuid, text, text) TO service_role;
