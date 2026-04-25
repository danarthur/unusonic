-- =============================================================================
-- Replies — Phase 1 Hardening Pass
--
-- Ships the research-driven findings from the 2026-04-24 deep-dive into the
-- inbound pipeline. Four-agent convergence (Explore, Field Expert, Critic,
-- User Advocate) surfaced one correctness bug and a cluster of safety /
-- observability gaps that would bite the first pilot (Invisible Touch Events):
--
--   1. Thread resolution bug (Explore Critical #1, Critic #27) — the handler
--      resolves threadId via alias but the RPC independently re-looks-up by
--      provider_thread_key, creating a fresh thread on mismatch. Real-world
--      repro: Gmail's default compose ships a unique Message-ID with no
--      In-Reply-To/References, handler falls through to Message-ID as the
--      thread key, RPC fails to match, creates a new thread. Observed bug:
--      thread 1b0d97d7-... inbound landed on new thread accb5755-...
--
--   2. No DB-level idempotency (Critic #10, #11) — Postmark retries on any
--      5xx flap for 12h. Application-level provider_message_id check is
--      TOCTOU race-vulnerable. A concurrent retry can produce duplicate rows.
--
--   3. No DLQ (Critic #42) — parse failures currently 200 to Postmark and
--      log a console.warn. Postmark won't retry; the message is lost with
--      no recovery path. "One missed reply" is the pilot-ending event
--      (User Advocate §3).
--
--   4. No unmatched triage (User Advocate §3 "Unmatched Replies triage") —
--      when an inbound email's alias doesn't resolve to a known thread, we
--      should flag it for manual assignment, not silently create a new
--      thread (which is what the RPC does today).
--
--   5. No auto-reply classification (Critic #14, User Advocate §8) — OOO
--      auto-responders and mailer-daemon bounces land on the Replies card
--      as first-class messages, triggering notifications and polluting the
--      deal feed. RFC 3834 headers let us tag-and-mute.
--
-- This migration adds the DB surface. The handler + UI land on top in the
-- same PR.
-- =============================================================================


-- =============================================================================
-- 1. ops.inbound_raw_payloads — the DLQ
--
-- Every POST body from Postmark lands here BEFORE any parsing. On parse
-- failure, the row stays with a non-'parsed' status so an operator can
-- replay or manually route the message. The full JSONB is retained so we
-- can re-run a parser fix against historical payloads without waiting for
-- a new client send.
--
-- Retention: this table grows unboundedly. Ship with an explicit note that
-- Phase 1.5 adds a monthly archival job (raw JSONB → cold storage after 90
-- days, keep summary row). For the pilot volume (1 workspace, <50 inbound
-- per week) this is not a near-term concern.
-- =============================================================================

CREATE TABLE IF NOT EXISTS ops.inbound_raw_payloads (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  received_at          timestamptz NOT NULL DEFAULT now(),
  provider             text NOT NULL,
  provider_message_id  text,
  raw_payload          jsonb NOT NULL,
  parse_status         text NOT NULL DEFAULT 'pending',
  parse_reason         text,
  message_id           uuid REFERENCES ops.messages(id) ON DELETE SET NULL,
  thread_id            uuid REFERENCES ops.message_threads(id) ON DELETE SET NULL,
  workspace_id         uuid,
  processed_at         timestamptz,
  CONSTRAINT parse_status_values CHECK (parse_status IN (
    'pending',
    'parsed',
    'parse_failed',
    'filtered_autoresponder',
    'unmatched_alias',
    'unverified_sender',
    'auth_failed',
    'duplicate'
  ))
);

-- Read access patterns. Operators will filter by status+received_at most
-- often (the Unmatched Replies page); observability queries sum over
-- (workspace_id, received_at).
CREATE INDEX idx_raw_payloads_received ON ops.inbound_raw_payloads (received_at DESC);
CREATE INDEX idx_raw_payloads_status ON ops.inbound_raw_payloads (parse_status, received_at DESC);
CREATE INDEX idx_raw_payloads_workspace ON ops.inbound_raw_payloads (workspace_id, received_at DESC)
  WHERE workspace_id IS NOT NULL;
CREATE INDEX idx_raw_payloads_thread ON ops.inbound_raw_payloads (thread_id)
  WHERE thread_id IS NOT NULL;

-- RLS — standard workspace isolation.
ALTER TABLE ops.inbound_raw_payloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY raw_payloads_select ON ops.inbound_raw_payloads
  FOR SELECT
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- No INSERT/UPDATE/DELETE policies — writes flow exclusively through the
-- system-role webhook handler. Service-role bypasses RLS.

GRANT SELECT ON ops.inbound_raw_payloads TO authenticated;
GRANT INSERT, UPDATE ON ops.inbound_raw_payloads TO service_role;
GRANT USAGE ON SCHEMA ops TO service_role;

COMMENT ON TABLE ops.inbound_raw_payloads IS
  'DLQ + audit log for every inbound webhook POST. Store raw JSONB before parse; update parse_status after. Enables replay of pre-fix payloads and prevents silent drops.';


-- =============================================================================
-- 2. Unique index on ops.messages for true idempotency
--
-- Application-level check in record_inbound_message was TOCTOU-vulnerable
-- to concurrent Postmark retries. This partial unique index provides the
-- DB-level guarantee. Partial because outbound drafts exist briefly with
-- NULL provider_message_id before stamp_outbound_provider_id runs.
--
-- (workspace_id, provider_message_id) scoping prevents a provider's
-- recycled IDs (unlikely but possible across vendors or test envs) from
-- colliding across workspaces.
-- =============================================================================

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_workspace_provider_message
  ON ops.messages (workspace_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;


-- =============================================================================
-- 3. Triage columns on ops.message_threads
--
-- When an inbound alias resolves to a workspace but not a known thread
-- (client forwarded a stale alias, replied to a deleted thread, etc.), we
-- now flag the raw payload for triage instead of silently creating a new
-- thread. The ops.message_threads table doesn't need new columns for this
-- — the DLQ handles it. But we DO add triage metadata so the Unmatched
-- Replies UI can mark a thread reviewed / reassigned.
-- =============================================================================

ALTER TABLE ops.message_threads
  ADD COLUMN IF NOT EXISTS triaged_at timestamptz,
  ADD COLUMN IF NOT EXISTS triaged_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN ops.message_threads.triaged_at IS
  'Set when a workspace member reviews an auto-created or unmatched thread and confirms its attachment.';


-- =============================================================================
-- 4. Auto-reply classification on ops.messages
--
-- RFC 3834 auto-responders (OOO, vacation, acknowledgments) and bounces
-- land as real messages on the thread but with is_auto_reply=true so the
-- UI can mute them, notifications skip them, and Aion's classifier can
-- choose to ignore them for urgency scoring.
--
-- auto_reply_reason captures WHICH signal triggered the classification, for
-- debuggability and future tuning (e.g., "Precedence: bulk", "From: mailer-daemon").
-- =============================================================================

ALTER TABLE ops.messages
  ADD COLUMN IF NOT EXISTS is_auto_reply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reply_reason text;

CREATE INDEX IF NOT EXISTS idx_messages_thread_visible
  ON ops.messages (thread_id, created_at DESC)
  WHERE is_auto_reply = false;

COMMENT ON COLUMN ops.messages.is_auto_reply IS
  'True when the inbound message was classified as an auto-responder (OOO, acknowledgment) or bounce via RFC 3834 headers or heuristics. UI mutes display; notifications suppress. See src/app/api/webhooks/postmark/__lib__/auto-reply.ts.';


-- =============================================================================
-- 5. Safety audit — service_role required for DLQ writes only
-- =============================================================================

DO $$
BEGIN
  -- Confirm no PUBLIC/anon has write privileges on the DLQ table.
  IF has_table_privilege('anon', 'ops.inbound_raw_payloads', 'INSERT') THEN
    RAISE EXCEPTION 'Safety check failed: anon has INSERT on ops.inbound_raw_payloads';
  END IF;
  IF has_table_privilege('authenticated', 'ops.inbound_raw_payloads', 'INSERT') THEN
    RAISE EXCEPTION 'Safety check failed: authenticated has INSERT on ops.inbound_raw_payloads';
  END IF;
END $$;
