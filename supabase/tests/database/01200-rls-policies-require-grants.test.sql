-- Schema invariant: an RLS policy without a matching table GRANT is a silent
-- outage.
--
-- Postgres checks privileges BEFORE it checks row security. A table with
-- correct, workspace-scoped policies but no GRANT fails every call with
-- "permission denied for table x" -- the feature is simply dead, and because
-- most callers discard the error it fails quietly.
--
-- This has shipped three times:
--   * cortex.aion_insights          (2026-06-11) -- Daily Brief rendered empty
--   * directory.entity_documents    (2026-09-01) -- entity documents never loaded
--   * 9 more tables                 (2026-09-01) -- call-time rules, ROS templates,
--                                                   event expenses, gear drift,
--                                                   Aion memory/consent/notices
--
-- The rule: every policy that can actually admit a row must have the matching
-- privilege granted to authenticated.
--
-- Deliberate denies are excluded automatically -- a policy of USING (false) or
-- WITH CHECK (false) exists to forbid the operation (e.g. cortex write
-- protection, where writes go through SECURITY DEFINER RPCs), so it must NOT
-- have a grant.
--
-- A column-level grant counts. `public.workspaces` is deliberately built that
-- way: table UPDATE is revoked and re-granted on the settings columns only, so
-- an owner can change the portal theme and cannot change subscription_tier.
-- `has_table_privilege` is false there and the policy is still reachable, which
-- is the distinction this test has to make -- an outage is "no privilege at
-- all", not "privilege on some columns". `has_any_column_privilege` is true for
-- a table-level grant as well, so this only ever widens what passes; DELETE
-- keeps the table-level check because Postgres has no column-level DELETE.

BEGIN;
SELECT plan(2);

-- Tables where the absence of a grant is intentional and reviewed.
CREATE TEMP TABLE grant_exceptions (sch text, tbl text, priv text, reason text);
INSERT INTO grant_exceptions VALUES
  ('ops', 'assignments', NULL,
   'Legacy table superseded by ops.crew_assignments: zero rows, no app callers.'),
  ('cortex', 'aion_refusal_log', NULL,
   'Written by service role only; no session-client caller.'),
  ('directory', 'entity_documents', 'DELETE',
   'Documents are archived via UPDATE (status = archived); no hard-delete path.');

CREATE TEMP VIEW policy_grant_gaps AS
WITH pol AS (
  SELECT n.nspname AS sch, c.relname AS tbl, c.oid AS reloid,
         p.polcmd, p.polroles,
         pg_get_expr(p.polqual, p.polrelid)      AS using_expr,
         pg_get_expr(p.polwithcheck, p.polrelid) AS check_expr
  FROM pg_policy p
  JOIN pg_class c     ON c.oid = p.polrelid
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname IN ('public','ops','finance','directory','cortex','aion')
), live AS (
  -- Drop deny-all policies: they exist to forbid, not to admit.
  SELECT * FROM pol
  WHERE COALESCE(btrim(using_expr), '') <> 'false'
    AND COALESCE(btrim(check_expr), '') <> 'false'
), expanded AS (
  SELECT sch, tbl, reloid, polroles,
         unnest(CASE polcmd
                  WHEN '*' THEN ARRAY['SELECT','INSERT','UPDATE','DELETE']
                  WHEN 'r' THEN ARRAY['SELECT']
                  WHEN 'a' THEN ARRAY['INSERT']
                  WHEN 'w' THEN ARRAY['UPDATE']
                  WHEN 'd' THEN ARRAY['DELETE']
                END) AS priv
  FROM live
)
SELECT DISTINCT e.sch, e.tbl, e.priv
FROM expanded e
WHERE
  -- Policy applies to authenticated (PUBLIC, no roles, or named explicitly).
  (
    e.polroles IS NULL
    OR array_length(e.polroles, 1) IS NULL
    OR 0 = ANY(e.polroles)
    OR (SELECT oid FROM pg_roles WHERE rolname = 'authenticated') = ANY(e.polroles)
  )
  AND NOT (
    has_table_privilege('authenticated', e.reloid, e.priv)
    OR (
      e.priv IN ('SELECT', 'INSERT', 'UPDATE')
      AND has_any_column_privilege('authenticated', e.reloid, e.priv)
    )
  )
  AND NOT EXISTS (
    SELECT 1 FROM grant_exceptions x
    WHERE x.sch = e.sch AND x.tbl = e.tbl AND (x.priv IS NULL OR x.priv = e.priv)
  );

SELECT is(
  (SELECT count(*)::int FROM policy_grant_gaps),
  0,
  'every RLS policy that can admit a row has a matching grant to authenticated'
    || COALESCE(
         ' -- missing: ' || (SELECT string_agg(sch || '.' || tbl || ' ' || priv, ', ' ORDER BY sch, tbl, priv)
                             FROM policy_grant_gaps),
         '')
);

-- The other half of the workspaces design: the column grant is what keeps the
-- UPDATE policy from being a way to change the plan you are paying for. A
-- future migration that reaches for a plain `GRANT UPDATE ON public.workspaces`
-- would satisfy the test above and fail this one.
SELECT is(
  (SELECT count(*)::int FROM unnest(ARRAY[
     'stripe_customer_id', 'stripe_subscription_id', 'subscription_tier',
     'billing_status', 'extra_seats', 'trial_ends_at'
   ]) AS col
   WHERE has_column_privilege('authenticated', 'public.workspaces', col, 'UPDATE')),
  0,
  'authenticated cannot update the commercial columns on public.workspaces'
);

SELECT * FROM finish();
ROLLBACK;
