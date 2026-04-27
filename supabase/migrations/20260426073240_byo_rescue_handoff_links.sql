-- BYO rescue flow — handoff links table.
-- Design doc: docs/reference/byo-rescue-flow-design.md

CREATE TABLE ops.handoff_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('dns_helper', 'mobile_handoff')),
  public_token text NOT NULL UNIQUE,
  recipient text NOT NULL,
  recipient_kind text NOT NULL CHECK (recipient_kind IN ('email', 'sms')),
  recipient_name text,
  sender_user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  sender_message text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  sent_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '30 days'),
  confirmed_at timestamptz,
  revoked_at timestamptz,
  resend_message_id text,
  twilio_message_sid text
);

CREATE INDEX handoff_links_workspace_pending
  ON ops.handoff_links(workspace_id, sent_at DESC)
  WHERE confirmed_at IS NULL AND revoked_at IS NULL;

COMMENT ON COLUMN ops.handoff_links.public_token IS '32-byte base64url. Anon-readable via system.ts only.';

ALTER TABLE ops.handoff_links ENABLE ROW LEVEL SECURITY;

CREATE POLICY handoff_links_select ON ops.handoff_links
  FOR SELECT
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY handoff_links_insert ON ops.handoff_links
  FOR INSERT
  WITH CHECK (
    workspace_id IN (SELECT public.get_my_workspace_ids())
    AND sender_user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = handoff_links.workspace_id
         AND wm.user_id = auth.uid()
         AND wm.role IN ('owner', 'admin')
    )
  );

CREATE POLICY handoff_links_update ON ops.handoff_links
  FOR UPDATE
  USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = handoff_links.workspace_id
         AND wm.user_id = auth.uid()
         AND wm.role IN ('owner', 'admin')
    )
  );

GRANT SELECT, INSERT, UPDATE ON ops.handoff_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.handoff_links TO service_role;
