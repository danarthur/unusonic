-- =============================================================================
-- Replies — Phase 1 P0 #1
--
-- Three-table foundation for the Replies feature (see
-- docs/reference/replies-design.md §4.1).
--
--   • ops.message_threads           — conversation boundary, per-thread not per-deal
--   • ops.messages                  — individual message events (inbound + outbound)
--   • ops.message_channel_identities — per-user connected identities (email/SMS)
--
-- RLS: workspace-scoped SELECT via get_my_workspace_ids(); writes ONLY via
-- SECURITY DEFINER RPCs (see 20260429000001_ops_record_message_rpcs.sql).
-- No INSERT/UPDATE/DELETE policies are exposed to authenticated — service role
-- writes via the RPCs.
--
-- Idempotency: ops.messages.provider_message_id is UNIQUE. Webhook retries on
-- the same provider message ID are no-ops. This is the single most important
-- correctness invariant for the inbound path.
-- =============================================================================


-- =============================================================================
-- 1. ops.message_threads
-- =============================================================================

CREATE TABLE ops.message_threads (
  id                   uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id         uuid        NOT NULL,
  -- Normalized thread key. Email: RFC 2822 Message-ID of the first message in
  -- the References chain. SMS (Phase 1.5): Twilio conversation_sid.
  provider_thread_key  text        NOT NULL,
  channel              text        NOT NULL CHECK (channel IN ('email', 'sms', 'call_note')),
  subject              text,
  -- Application-level FK (matches ops.follow_up_log pattern — deals live in
  -- public, FK chain across schemas is deliberately informal).
  deal_id              uuid,
  primary_entity_id    uuid REFERENCES directory.entities(id) ON DELETE SET NULL,
  last_message_at      timestamptz NOT NULL DEFAULT now(),
  unread_by_user_ids   uuid[]      NOT NULL DEFAULT '{}',
  -- True when sender→entity match failed OR deal couldn't be bound. Drives
  -- the Unresolved triage queue at /replies/unresolved.
  needs_resolution     boolean     NOT NULL DEFAULT false,
  dismissed_at         timestamptz,
  created_at           timestamptz NOT NULL DEFAULT now(),

  -- One thread per provider_thread_key per workspace. Prevents duplicate
  -- threads when a retry races the initial insert.
  UNIQUE (workspace_id, provider_thread_key)
);

COMMENT ON TABLE ops.message_threads IS
  'Conversation boundary for ops.messages. Keyed on RFC 2822 Message-ID root (email) or Twilio conversation_sid (SMS). One deal may carry many threads.';

CREATE INDEX message_threads_deal_last_message_idx
  ON ops.message_threads (deal_id, last_message_at DESC)
  WHERE deal_id IS NOT NULL;

CREATE INDEX message_threads_workspace_last_message_idx
  ON ops.message_threads (workspace_id, last_message_at DESC);

-- Hot query for /replies/unresolved: pending unresolved threads for a workspace.
CREATE INDEX message_threads_needs_resolution_idx
  ON ops.message_threads (workspace_id, last_message_at DESC)
  WHERE needs_resolution = true AND dismissed_at IS NULL;

ALTER TABLE ops.message_threads ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_threads_select ON ops.message_threads
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

-- No INSERT/UPDATE/DELETE policies — writes flow through SECURITY DEFINER RPCs.
GRANT SELECT ON ops.message_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ops.message_threads TO service_role;


-- =============================================================================
-- 2. ops.messages
-- =============================================================================

CREATE TABLE ops.messages (
  id                     uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid        NOT NULL,
  thread_id              uuid        NOT NULL REFERENCES ops.message_threads(id) ON DELETE CASCADE,
  direction              text        NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  channel                text        NOT NULL CHECK (channel IN ('email', 'sms', 'call_note')),
  -- Resend email_id or Twilio MessageSid. NULLable during the insert-first
  -- outbound path (the row is created before Resend returns the ID); the
  -- stamp RPC fills it in once the send succeeds. Partial UNIQUE index below
  -- enforces webhook idempotency for everything that HAS an ID.
  provider_message_id    text,
  in_reply_to            uuid REFERENCES ops.messages(id) ON DELETE SET NULL,
  -- Sender resolution. Nullable when sender→entity match fails (→ Unresolved).
  from_entity_id         uuid REFERENCES directory.entities(id) ON DELETE SET NULL,
  from_address           text        NOT NULL,
  to_addresses           text[]      NOT NULL DEFAULT '{}',
  cc_addresses           text[]      NOT NULL DEFAULT '{}',
  -- Multipart MIME rule from docs/reference/code/email-sending.md: body_text
  -- is always populated; body_html is nullable (NULL for SMS).
  body_text              text,
  body_html              text,
  -- Metadata-only — attachment bytes land in Supabase Storage at
  -- workspace-{id}/messages/{id}/{filename}. NEVER inline base64 here.
  attachments            jsonb       NOT NULL DEFAULT '[]'::jsonb,
  sent_by_user_id        uuid,
  delivered_at           timestamptz,
  opened_at              timestamptz,
  clicked_at             timestamptz,
  bounced_at             timestamptz,
  replied_at             timestamptz,
  -- Phase 1: populated by keyword heuristic in record_inbound_message. First
  -- matched keyword from workspace's urgency keyword set (deposit, confirmed,
  -- booked, cancel, decline, contract). NULL = no urgent match.
  urgency_keyword_match  text,
  -- Phase 1.5+: Aion classification + one-line summary. Reserved now, no
  -- writers yet.
  ai_classification      text,
  ai_summary             text,
  -- Portal gating — mirrors ops.follow_up_queue pattern. Phase 1.5 wires
  -- ops.portal_messages_v view.
  hide_from_portal       boolean     NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now()
);

-- Webhook idempotency guard. Partial UNIQUE so the insert-first outbound path
-- (NULL provider_message_id until Resend returns it) doesn't collide.
-- Provider IDs are provider-globally unique so no per-workspace scoping needed.
CREATE UNIQUE INDEX messages_provider_message_id_uniq
  ON ops.messages (provider_message_id)
  WHERE provider_message_id IS NOT NULL;

COMMENT ON TABLE ops.messages IS
  'Individual message events (inbound + outbound) on ops.message_threads. provider_message_id UNIQUE enforces webhook idempotency — retries on the same provider ID are no-ops.';

CREATE INDEX messages_thread_created_idx
  ON ops.messages (thread_id, created_at DESC);

CREATE INDEX messages_workspace_created_idx
  ON ops.messages (workspace_id, created_at DESC);

-- Hot query for follow-up auto-resolution: find recent inbound messages on a deal.
CREATE INDEX messages_thread_direction_created_idx
  ON ops.messages (thread_id, direction, created_at DESC);

-- Hot query for Needs Response SLA: deals with inbound + no recent outbound.
CREATE INDEX messages_workspace_direction_created_idx
  ON ops.messages (workspace_id, direction, created_at DESC);

ALTER TABLE ops.messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY messages_select ON ops.messages
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT ON ops.messages TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ops.messages TO service_role;


-- =============================================================================
-- 3. ops.message_channel_identities
-- =============================================================================

CREATE TABLE ops.message_channel_identities (
  id                        uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              uuid        NOT NULL,
  -- NULL for workspace-shared identities (e.g. the booking@ alias). Set for
  -- user-connected personal identities.
  user_id                   uuid,
  channel                   text        NOT NULL CHECK (channel IN ('email', 'sms')),
  identity_address          text        NOT NULL,
  provider                  text        NOT NULL CHECK (provider IN ('resend', 'twilio', 'gmail_oauth', 'microsoft_graph')),
  -- Reference to the actual credential (OAuth token ID in a separate secrets
  -- table, Twilio subaccount SID, etc.). NEVER the raw secret.
  provider_credential_ref   text,
  verified_at               timestamptz,
  -- Privacy lever. TRUE = this identity's messages are hidden from the
  -- cross-deal Entity Messages tab (Phase 1.5). Per docs/reference/replies-design.md
  -- §5.1: deal-scoped messages remain workspace-visible regardless, so this
  -- flag only gates the aggregate entity view.
  --
  -- DEFAULT FALSE — workspace-visible by default. Opt in to privacy via the
  -- connect-identity flow's second screen toggle.
  is_private                boolean     NOT NULL DEFAULT false,
  revoked_at                timestamptz,
  created_at                timestamptz NOT NULL DEFAULT now(),

  -- Prevent duplicate connections of the same address per workspace.
  UNIQUE (workspace_id, channel, identity_address)
);

COMMENT ON TABLE ops.message_channel_identities IS
  'Per-user (or workspace-shared) connected message identities. is_private gates the cross-deal Entity Messages view only; deal-scoped messages remain workspace-visible regardless. Default is_private=false.';

CREATE INDEX message_channel_identities_workspace_idx
  ON ops.message_channel_identities (workspace_id)
  WHERE revoked_at IS NULL;

CREATE INDEX message_channel_identities_user_idx
  ON ops.message_channel_identities (user_id)
  WHERE user_id IS NOT NULL AND revoked_at IS NULL;

ALTER TABLE ops.message_channel_identities ENABLE ROW LEVEL SECURITY;

-- Users see all identities in their workspaces, so they can distinguish their
-- own from workspace-shared ones and from teammates' connected identities.
-- The is_private flag gates content visibility at the Entity Messages view
-- level (Phase 1.5) — NOT at the identity-row level.
CREATE POLICY message_channel_identities_select ON ops.message_channel_identities
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT ON ops.message_channel_identities TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ops.message_channel_identities TO service_role;


-- =============================================================================
-- 4. Per-workspace alias lookup
--
-- Per-thread Reply-To addresses on replies.unusonic.com need a way to map
-- alias → (workspace, thread). The thread-key encoding IS the alias local
-- part: thread-{thread_uuid}@replies.unusonic.com. Resolution is a direct
-- lookup on ops.message_threads.id, so no separate alias table is required.
-- Workspace identity on the receiving side comes from looking up the deal's
-- workspace or falling back to the "unknown workspace" triage pool (future).
--
-- This comment is here so future-us doesn't wonder where the alias table is.
-- =============================================================================
