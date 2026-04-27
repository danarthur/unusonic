-- Replies Phase 1 Hardening — DLQ + idempotency + triage + auto-reply classification

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

CREATE INDEX IF NOT EXISTS idx_raw_payloads_received ON ops.inbound_raw_payloads (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_payloads_status ON ops.inbound_raw_payloads (parse_status, received_at DESC);
CREATE INDEX IF NOT EXISTS idx_raw_payloads_workspace ON ops.inbound_raw_payloads (workspace_id, received_at DESC)
  WHERE workspace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_raw_payloads_thread ON ops.inbound_raw_payloads (thread_id)
  WHERE thread_id IS NOT NULL;

ALTER TABLE ops.inbound_raw_payloads ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS raw_payloads_select ON ops.inbound_raw_payloads;
CREATE POLICY raw_payloads_select ON ops.inbound_raw_payloads
  FOR SELECT
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT ON ops.inbound_raw_payloads TO authenticated;
GRANT INSERT, UPDATE ON ops.inbound_raw_payloads TO service_role;
GRANT USAGE ON SCHEMA ops TO service_role;

COMMENT ON TABLE ops.inbound_raw_payloads IS
  'DLQ + audit log for every inbound webhook POST. Store raw JSONB before parse; update parse_status after. Enables replay of pre-fix payloads and prevents silent drops.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_messages_workspace_provider_message
  ON ops.messages (workspace_id, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

ALTER TABLE ops.message_threads
  ADD COLUMN IF NOT EXISTS triaged_at timestamptz,
  ADD COLUMN IF NOT EXISTS triaged_by_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

COMMENT ON COLUMN ops.message_threads.triaged_at IS
  'Set when a workspace member reviews an auto-created or unmatched thread and confirms its attachment.';

ALTER TABLE ops.messages
  ADD COLUMN IF NOT EXISTS is_auto_reply boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS auto_reply_reason text;

CREATE INDEX IF NOT EXISTS idx_messages_thread_visible
  ON ops.messages (thread_id, created_at DESC)
  WHERE is_auto_reply = false;

COMMENT ON COLUMN ops.messages.is_auto_reply IS
  'True when the inbound message was classified as an auto-responder (OOO, acknowledgment) or bounce via RFC 3834 headers or heuristics. UI mutes display; notifications suppress.';

DO $$
BEGIN
  IF has_table_privilege('anon', 'ops.inbound_raw_payloads', 'INSERT') THEN
    RAISE EXCEPTION 'Safety check failed: anon has INSERT on ops.inbound_raw_payloads';
  END IF;
  IF has_table_privilege('authenticated', 'ops.inbound_raw_payloads', 'INSERT') THEN
    RAISE EXCEPTION 'Safety check failed: authenticated has INSERT on ops.inbound_raw_payloads';
  END IF;
END $$;
