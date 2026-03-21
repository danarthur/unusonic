-- =============================================================================
-- DIAGNOSTIC: Find what triggers "infinite recursion in policy for relation entities"
-- Run this in Supabase Dashboard → SQL Editor (read-only; no changes).
-- =============================================================================

-- ONE-SHOT: Run this single query and paste the FULL result (all rows).
-- It returns every policy on entities, every policy that mentions "entities", and get_my_entity_id.
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
    pol.cmd::text,
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
    pol.cmd::text,
    pol.qual::text AS using_expr,
    pol.with_check::text AS with_check_expr,
    NULL::text AS extra
  FROM pg_policies pol
  WHERE pol.schemaname = 'public'
    AND (pol.qual::text ILIKE '%entities%' OR pol.with_check::text ILIKE '%entities%')
  UNION ALL
  SELECT
    'get_my_entity_id' AS section,
    NULL AS tablename,
    NULL AS policyname,
    l.lanname AS cmd,
    CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'INVOKER' END AS using_expr,
    COALESCE(array_to_string(p.proconfig, ', '), '') AS with_check_expr,
    (SELECT l.lanname FROM pg_language l WHERE l.oid = p.prolang) AS extra
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  JOIN pg_language l ON l.oid = p.prolang
  WHERE n.nspname = 'public' AND p.proname = 'get_my_entity_id'
) t
ORDER BY section, tablename, policyname;

-- -----------------------------------------------------------------------------
-- Individual sections (if you prefer to run separately):
-- -----------------------------------------------------------------------------

-- 1. All policies ON the "entities" table (these run when entities is read/written)
SELECT
  'POLICIES ON entities' AS section,
  policyname,
  cmd AS command,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public' AND tablename = 'entities'
ORDER BY policyname;

-- 2. All policies that REFERENCE "entities" (any table) — recursion often comes from
--    another table's policy doing SELECT FROM entities
SELECT
  'POLICIES THAT REFERENCE entities' AS section,
  tablename,
  policyname,
  cmd AS command,
  qual AS using_expression,
  with_check
FROM pg_policies
WHERE schemaname = 'public'
  AND (
    qual::text ILIKE '%entities%'
    OR with_check::text ILIKE '%entities%'
  )
ORDER BY tablename, policyname;

-- 3. get_my_entity_id() — must have row_security = off and SECURITY DEFINER
SELECT
  'FUNCTION get_my_entity_id' AS section,
  p.proname AS name,
  CASE WHEN p.prosecdef THEN 'SECURITY DEFINER' ELSE 'SECURITY INVOKER' END AS security,
  p.proconfig AS config
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'get_my_entity_id';

-- 4. Raw policy definitions (pg_get_expr) for entities — exact expressions
SELECT
  'ENTITY POLICY EXPRESSIONS' AS section,
  c.relname AS table_name,
  p.polname AS policy_name,
  p.polcmd AS command,
  pg_get_expr(p.polqual, p.polrelid) AS using_expr,
  pg_get_expr(p.polwithcheck, p.polrelid) AS with_check_expr
FROM pg_policy p
JOIN pg_class c ON c.oid = p.polrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
WHERE n.nspname = 'public' AND c.relname = 'entities'
ORDER BY p.polname;

-- 5. Triggers on "entities" — a trigger could re-query entities and cause recursion
SELECT
  'TRIGGERS ON entities' AS section,
  t.tgname AS trigger_name,
  p.proname AS function_name,
  CASE t.tgtype::integer & 66
    WHEN 2 THEN 'BEFORE'
    WHEN 64 THEN 'INSTEAD OF'
    ELSE 'AFTER'
  END AS timing,
  CASE t.tgtype::integer & 28
    WHEN 4 THEN 'INSERT'
    WHEN 8 THEN 'DELETE'
    WHEN 16 THEN 'UPDATE'
  END AS event
FROM pg_trigger t
JOIN pg_class c ON c.oid = t.tgrelid
JOIN pg_namespace n ON n.oid = c.relnamespace
JOIN pg_proc p ON p.oid = t.tgfoid
WHERE n.nspname = 'public'
  AND c.relname = 'entities'
  AND NOT t.tgisinternal
ORDER BY t.tgname;

-- 6. Full definition of set_updated_at — if it SELECTs from entities, that causes recursion
SELECT
  'FUNCTION set_updated_at SOURCE' AS section,
  pg_get_functiondef(p.oid) AS definition
FROM pg_proc p
JOIN pg_namespace n ON n.oid = p.pronamespace
WHERE n.nspname = 'public' AND p.proname = 'set_updated_at';
