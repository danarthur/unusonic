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
-- One table is granted per column rather than per table: `public.workspaces`
-- revokes table UPDATE and re-grants the settings columns, so an owner can
-- change the portal theme and cannot change subscription_tier. That is a
-- deliberate exception, and it is listed as one below rather than relaxing the
-- rule for everybody.
--
-- The first version of this accepted `has_any_column_privilege` everywhere,
-- which sounds equivalent and is not: that predicate is satisfied by ONE
-- granted column, so a settings column added without a grant would 42501 on
-- every write and this test would stay green -- the exact outage class in the
-- header, admitted by the fix for it. Hence the named exception plus the
-- exact-set assertion at the bottom.

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
   'Documents are archived via UPDATE (status = archived); no hard-delete path.'),
  ('public', 'workspaces', 'UPDATE',
   'Granted per column, not per table — see the exact-set assertion below.');

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
  AND NOT has_table_privilege('authenticated', e.reloid, e.priv)
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

-- The exception above is only safe if the exception is exactly what we think it
-- is. Assert the granted set, not a denylist of six names somebody has to
-- remember to extend: this fails if a commercial column is granted, if a plain
-- `GRANT UPDATE ON public.workspaces` lands, AND if a settings column is added
-- without its grant -- which is the case the first version of this test missed.
SELECT set_eq(
  $$SELECT column_name::text
      FROM information_schema.column_privileges
     WHERE table_schema = 'public' AND table_name = 'workspaces'
       AND grantee = 'authenticated' AND privilege_type = 'UPDATE'$$,
  ARRAY[
    'portal_theme_preset', 'portal_theme_config',
    'default_deposit_percent', 'default_deposit_deadline_days',
    'default_balance_due_days_before_event',
    'sms_signin_enabled', 'require_equipment_verification',
    'sending_domain', 'resend_domain_id', 'sending_domain_status',
    'sending_from_name', 'sending_from_localpart', 'dmarc_status'
  ],
  'authenticated may update exactly the settings columns on public.workspaces'
);

SELECT * FROM finish();
ROLLBACK;
