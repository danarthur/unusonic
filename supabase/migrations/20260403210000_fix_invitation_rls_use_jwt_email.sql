-- Fix: invitations_own_email_select and invitations_update policies reference
-- auth.users directly, but the authenticated role has no SELECT grant on that table.
-- This causes permission errors for authenticated users who aren't workspace members
-- (e.g. newly signed-up employees claiming their invite).
-- Replace with auth.jwt()->>'email' which reads from the JWT token directly.

-- Fix SELECT policy
DROP POLICY IF EXISTS invitations_own_email_select ON public.invitations;
CREATE POLICY invitations_own_email_select ON public.invitations
  FOR SELECT
  TO authenticated
  USING (
    lower(email) = lower(auth.jwt()->>'email')
  );

-- Fix UPDATE policy (also references auth.users for email check)
DROP POLICY IF EXISTS invitations_update ON public.invitations;
CREATE POLICY invitations_update ON public.invitations
  FOR UPDATE
  USING (
    (organization_id IN (
      SELECT entities.legacy_org_id::text
      FROM directory.entities
      WHERE entities.owner_workspace_id IN (
        SELECT workspace_members.workspace_id
        FROM workspace_members
        WHERE workspace_members.user_id = auth.uid()
      )
      AND entities.legacy_org_id IS NOT NULL
    ))
    OR
    (lower(email) = lower(auth.jwt()->>'email'))
  );
