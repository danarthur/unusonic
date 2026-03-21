-- Copy and run ONLY this one query in Supabase SQL Editor. Paste the FULL result (all rows).

SELECT
  section,
  tablename,
  policyname,
  cmd,
  using_expr,
  with_check_expr,
  extra
FROM (
  SELECT
    'ON entities' AS section,
    pol.tablename,
    pol.policyname,
    pol.cmd::text AS cmd,
    pol.qual::text AS using_expr,
    pol.with_check::text AS with_check_expr,
    NULL::text AS extra
  FROM pg_policies pol
  WHERE pol.schemaname = 'public' AND pol.tablename = 'entities'
  UNION ALL
  SELECT
    'REFERENCES entities' AS section,
    pol.tablename,
    pol.policyname,
    pol.cmd::text AS cmd,
    pol.qual::text AS using_expr,
    pol.with_check::text AS with_check_expr,
    NULL::text AS extra
  FROM pg_policies pol
  WHERE pol.schemaname = 'public'
    AND (pol.qual::text ILIKE '%entities%' OR pol.with_check::text ILIKE '%entities%')
  UNION ALL
  SELECT
    'get_my_entity_id' AS section,
    NULL::text AS tablename,
    NULL::text AS policyname,
    l.lanname AS cmd,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'INVOKER' END AS using_expr,
    COALESCE(array_to_string(p.proconfig, ', '), '(none)') AS with_check_expr,
    'language' AS extra
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.proname = 'get_my_entity_id'
) t
ORDER BY section, tablename, policyname;
