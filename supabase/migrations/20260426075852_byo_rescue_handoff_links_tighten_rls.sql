-- C1 fix from Guardian review of PR #26: restrict SELECT to admin/owner.
-- Original policy let any workspace member read `public_token`, which gave
-- non-admin members a fully-functional anonymous DNS-handoff URL. Public
-- read of the redacted view goes through service_role (system.ts) on the
-- public page; admins read full rows for the history list.

DROP POLICY IF EXISTS handoff_links_select ON ops.handoff_links;

CREATE POLICY handoff_links_select ON ops.handoff_links
  FOR SELECT
  USING (
    workspace_id IN (SELECT public.get_my_workspace_ids())
    AND EXISTS (
      SELECT 1 FROM public.workspace_members wm
       WHERE wm.workspace_id = handoff_links.workspace_id
         AND wm.user_id = auth.uid()
         AND wm.role IN ('owner', 'admin')
    )
  );
