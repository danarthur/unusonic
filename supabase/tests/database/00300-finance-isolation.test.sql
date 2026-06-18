-- Phase 4: finance.* access posture verification.
--
-- Access model (updated 2026-05-04, migration 20260504000100_finance_
-- authenticated_grants): the authenticated role has direct table GRANTs on
-- finance.invoices / invoice_line_items (full CRUD) and finance.payments
-- (SELECT), with workspace-scoped RLS (`workspace_id IN get_my_workspace_ids()`)
-- as the sole access decision point. The earlier "RPC-only, no grant" posture
-- was abandoned because the missing GRANT made /finance return "permission
-- denied for table invoices" for every authenticated user before RLS even
-- evaluated. anon still has no direct grant — public access is only via the
-- SECURITY DEFINER finance.get_public_invoice RPC.
--
-- This file asserts that posture: authenticated can read each table (grant +
-- RLS), anon cannot. Richer per-workspace isolation coverage should be added
-- by seeding cross-workspace rows — pre-pilot follow-up, not CI-repair scope.
BEGIN;
SELECT plan(4);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers (reused pattern) ──
CREATE OR REPLACE FUNCTION test_create_user_in_workspace(p_user_id uuid, p_workspace_id uuid, p_role text DEFAULT 'owner') RETURNS void AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, slug) VALUES (p_workspace_id, 'WS ' || p_workspace_id::text, 'ws-' || p_workspace_id::text) ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, created_at, updated_at, confirmation_token)
    VALUES (p_user_id, '00000000-0000-0000-0000-000000000000', p_user_id::text || '@test.local', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now(), now(), '')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.workspace_members (workspace_id, user_id, role) VALUES (p_workspace_id, p_user_id, p_role) ON CONFLICT (workspace_id, user_id) DO NOTHING;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_authenticate_as(p_user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object('sub', p_user_id::text, 'role', 'authenticated', 'email', p_user_id::text || '@test.local')::text, true);
  SET ROLE authenticated;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_reset_role() RETURNS void AS $$
BEGIN RESET ROLE; PERFORM set_config('request.jwt.claims', '', true); END; $$ LANGUAGE plpgsql;

-- ── Test data ──
SELECT test_create_user_in_workspace(
  'a1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid
);

-- ── Tests — authenticated reads succeed (grant + RLS); anon has no grant ──

-- 1. Authenticated workspace member can SELECT finance.invoices. The grant
--    lets the query run; RLS scopes the result to their workspace (0 rows here
--    since none seeded — the point is no "permission denied" at the grant gate).
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT lives_ok(
  $$SELECT count(*) FROM finance.invoices$$,
  'Authenticated can SELECT finance.invoices (grant + workspace RLS)'
);
SELECT test_reset_role();

-- 2. Authenticated workspace member can SELECT finance.payments (SELECT grant).
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT lives_ok(
  $$SELECT count(*) FROM finance.payments$$,
  'Authenticated can SELECT finance.payments (grant + workspace RLS)'
);
SELECT test_reset_role();

-- 3. Authenticated workspace member can SELECT finance.invoice_line_items.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT lives_ok(
  $$SELECT count(*) FROM finance.invoice_line_items$$,
  'Authenticated can SELECT finance.invoice_line_items (grant + workspace RLS)'
);
SELECT test_reset_role();

-- 4. anon has NO direct grant on finance.invoices — public access is only via
--    the SECURITY DEFINER get_public_invoice RPC. Checked structurally so the
--    assertion doesn't depend on anon being able to call pgTAP helpers.
SELECT ok(
  NOT has_table_privilege('anon', 'finance.invoices', 'SELECT'),
  'anon has no direct SELECT grant on finance.invoices'
);

SELECT * FROM finish();
ROLLBACK;
