-- Any signed-in user could make themselves owner of any workspace.
--
-- 20260428210000 created this:
--
--   CREATE POLICY "Authenticated users can join workspace" ON public.workspace_members
--     FOR INSERT TO authenticated
--     WITH CHECK (user_id = (SELECT auth.uid()));
--
-- It checks that you are inserting YOURSELF. It does not check WHICH workspace,
-- and it does not check AS WHAT. `public.workspace_members` is the table every
-- other schema's RLS joins through, so a row in it is the tenant boundary.
--
-- Proven on production inside a rolled-back transaction: a fresh user who
-- belonged to nothing inserted `role = 'owner'` into an existing workspace and
-- then read that workspace's deals. The anon key is public and every registered
-- account carries a usable JWT, so the route was `POST /rest/v1/workspace_members`.
--
-- No policy replaces it. Nothing should add a membership through a session
-- client -- not even your own. The two paths that did:
--
--   * `inviteTeamMember` adds somebody else, so it never satisfied this policy
--     and has been failing since the policy landed. It uses the system client
--     now, authorised by the owner/admin check it already performs.
--
--   * the ghost-org claim added the claimer as owner of `owner_workspace_id`,
--     which for a ghost is the workspace of whoever CREATED the ghost. Every
--     unclaimed company entity in production points at a workspace that has
--     members. It no longer grants membership at all; the claim links the
--     person to the org, and access comes from an invitation.
--
-- UPDATE, DELETE and TRUNCATE go with it. There was no policy for any of them,
-- so they were already inert -- but "inert because nobody wrote a policy" is
-- what this migration exists to stop relying on.

DROP POLICY IF EXISTS "Authenticated users can join workspace" ON public.workspace_members;

REVOKE INSERT ON public.workspace_members FROM anon;
REVOKE INSERT ON public.workspace_members FROM authenticated;
REVOKE UPDATE, DELETE, TRUNCATE ON public.workspace_members FROM anon;
REVOKE UPDATE, DELETE, TRUNCATE ON public.workspace_members FROM authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_policies
             WHERE schemaname='public' AND tablename='workspace_members' AND cmd='INSERT') THEN
    RAISE EXCEPTION 'an INSERT policy still exists on public.workspace_members';
  END IF;
  IF has_table_privilege('authenticated','public.workspace_members','INSERT')
     OR has_any_column_privilege('authenticated','public.workspace_members','INSERT') THEN
    RAISE EXCEPTION 'authenticated can still INSERT into public.workspace_members';
  END IF;
  IF has_table_privilege('anon','public.workspace_members','INSERT')
     OR has_any_column_privilege('anon','public.workspace_members','INSERT') THEN
    RAISE EXCEPTION 'anon can still INSERT into public.workspace_members';
  END IF;
  -- The parts that must keep working.
  IF NOT has_table_privilege('service_role','public.workspace_members','INSERT') THEN
    RAISE EXCEPTION 'service_role lost INSERT on public.workspace_members';
  END IF;
  IF NOT has_table_privilege('authenticated','public.workspace_members','SELECT') THEN
    RAISE EXCEPTION 'authenticated lost SELECT on public.workspace_members';
  END IF;
END $$;
