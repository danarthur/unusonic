-- BYO rescue flow — handoff links table.
--
-- Owner of a workspace going through the BYO sending-domain wizard at
-- /settings/email may not want to add the DNS records themselves. They send
-- the records (and a snapshot-stable shareable URL) to "their tech person":
-- a freelancer, family member, registrar support agent, etc. This table
-- backs that handoff: one row per send, plus subsequent confirmation when
-- the recipient clicks the public link and runs the verify-now action.
--
-- The schema is generalized via `kind` so the sibling Phase 1.5 mobile
-- escape ("finish on desktop") can share the same primitive without a
-- second table. Today only `dns_helper` is wired; `mobile_handoff` ships
-- in PR #31.
--
-- Design doc: docs/reference/byo-rescue-flow-design.md
--
-- Access pattern:
--   - Owner-callable mutations go through the regular client + RLS.
--   - Public confirm page reads/writes via service role (system.ts),
--     matching the crew_confirmation_tokens pattern. No SECURITY DEFINER
--     RPCs — sidesteps the feedback_postgres_function_grants.md bug class.

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

-- Hot-path index: lobby tile + history list both filter on
-- (workspace_id, not-confirmed, not-revoked) ordered by sent_at desc.
CREATE INDEX handoff_links_workspace_pending
  ON ops.handoff_links(workspace_id, sent_at DESC)
  WHERE confirmed_at IS NULL AND revoked_at IS NULL;

-- Token lookups from the public page; UNIQUE constraint already creates
-- a btree, but explicit index naming helps reasoning.
COMMENT ON COLUMN ops.handoff_links.public_token IS '32-byte base64url. Anon-readable via system.ts only.';

-- ── RLS ────────────────────────────────────────────────────────────────────────

ALTER TABLE ops.handoff_links ENABLE ROW LEVEL SECURITY;

-- SELECT: any workspace member sees the workspace's handoff history.
CREATE POLICY handoff_links_select ON ops.handoff_links
  FOR SELECT
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

-- INSERT: workspace admin/owner only. Membership + role check enforced in
-- the server action (requireAdminOrOwner) too — RLS is defense-in-depth.
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

-- UPDATE: workspace admin/owner only. Used for revoke + resend rotation.
-- Public confirm path runs as service_role and bypasses RLS.
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

-- No DELETE policy — rows are retained as audit trail. Cascade from
-- workspace deletion is handled by the FK.

-- ── Grants ─────────────────────────────────────────────────────────────────────
-- service_role has default CRUD on ops.* per migration 20260410150000
-- (project_ops_schema_grants memory note). Explicit GRANTs here for
-- authenticated keep the RLS policies above functional under the regular
-- client.

GRANT SELECT, INSERT, UPDATE ON ops.handoff_links TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.handoff_links TO service_role;
