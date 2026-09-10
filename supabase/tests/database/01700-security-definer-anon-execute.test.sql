-- Which SECURITY DEFINER functions may `anon` execute?
--
-- `CREATE FUNCTION` grants EXECUTE to PUBLIC, and `anon` inherits it. A
-- SECURITY DEFINER function runs as its owner, so a forgotten REVOKE hands an
-- unauthenticated caller the owner's privileges. That has already happened
-- here once, across fourteen `client_*` RPCs, fixed in 20260410160000.
--
-- The rule was written down after that and enforced by nothing. This is the
-- test that makes forgetting fail -- and it caught a real one on its first run:
-- the migrations that hardened production live in `pre-baseline/`, which is not
-- applied to a fresh database, so a fresh build came up with sixteen extra
-- anon-executable functions including session minting and OTP verification.
-- 20260910240000 closed that in the folder that runs.
--
-- The allowlist itself is `public.anon_executable_secdef_allowlist()`, so this
-- test and that sweep read one definition. It used to be written out three
-- times -- twice in the migration, once here -- which is three copies of a
-- security boundary that agree until somebody edits one of them.
--
-- To add a name: put it in the function (a migration), with a comment saying
-- which of the three legitimate kinds it is -- an RLS helper, a trigger
-- function, or a genuinely public token-scoped read. Check first that it
-- returns NULL or FALSE for a caller with no `auth.uid()`. That property is
-- what makes the list safe rather than merely intended.

BEGIN;
SELECT plan(2);

-- 1. The live grant set is exactly the allowlist.
SELECT set_eq(
  $$SELECT (n.nspname || '.' || p.proname)::text
      FROM pg_proc p
      JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE p.prosecdef
       AND p.prokind = 'f'
       AND n.nspname IN ('public','ops','finance','directory','cortex','aion')
       AND has_function_privilege('anon', p.oid, 'EXECUTE')$$,
  $$SELECT unnest(public.anon_executable_secdef_allowlist())$$,
  'anon may execute exactly the SECURITY DEFINER functions on the allowlist'
);

-- 2. The allowlist function is not itself SECURITY DEFINER.
--
-- If it were, it would be in scope of its own check and would have to list
-- itself -- and a list that grants its own reader is not a boundary.
SELECT is(
  (SELECT p.prosecdef
     FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'anon_executable_secdef_allowlist'),
  false,
  'the allowlist function is not itself SECURITY DEFINER'
);

SELECT * FROM finish();
ROLLBACK;
