-- Allow authenticated users to read invitations addressed to their own email.
-- Required because the employee creates an account BEFORE accepting the invite.
-- At that point they're authenticated but not yet a workspace member, so the
-- workspace-scoped policy blocks the read. This policy lets them see their
-- own invitation to complete the claim flow.

CREATE POLICY invitations_own_email_select ON public.invitations
  FOR SELECT
  TO authenticated
  USING (
    lower(email) = lower((SELECT email FROM auth.users WHERE id = auth.uid()))
  );
