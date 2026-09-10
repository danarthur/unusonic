-- Drop the two invite-code functions.
--
-- Both reference `workspaces.invite_code`, `created_by` and `updated_at` --
-- none of which are columns of `public.workspaces` -- so both raise if called,
-- and nothing calls them.
--
-- `workspace_joinable_by_invite` is the reason this is a migration rather than
-- a note: it is SECURITY DEFINER and the baseline granted EXECUTE to `anon`. It
-- is inert today only because the columns are missing, which is a coincidence
-- rather than a control. Somebody restoring the invite-code feature would find
-- an anon-executable function already sitting in the join path.
--
-- Joining a workspace goes through `public.invitations` and
-- `acceptEmployeeInvite`.

DROP FUNCTION IF EXISTS public.workspace_joinable_by_invite(uuid);
DROP FUNCTION IF EXISTS public.regenerate_invite_code(uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public'
               AND p.proname IN ('workspace_joinable_by_invite','regenerate_invite_code')) THEN
    RAISE EXCEPTION 'invite-code functions still present';
  END IF;
END $$;
