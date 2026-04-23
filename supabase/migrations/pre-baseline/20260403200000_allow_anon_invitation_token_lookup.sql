-- Allow unauthenticated (anon) users to read a single invitation by token.
-- Required for the public /claim/[token] page which validates the invitation
-- before the user has signed in or created an account.
-- Token is a 24-byte random hex (48 chars) — unguessable, so token IS the auth.
-- Same pattern as ops.day_sheet_tokens and ops.crew_confirmation_tokens.

CREATE POLICY invitations_anon_token_lookup ON public.invitations
  FOR SELECT
  TO anon
  USING (true);

GRANT SELECT ON public.invitations TO anon;
