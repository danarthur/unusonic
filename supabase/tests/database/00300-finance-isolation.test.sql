-- Phase 4: finance.invoices isolation — current posture verification.
--
-- Per CLAUDE.md Finance Schema: authenticated role has NO direct grants on
-- finance.invoices. All reads + writes go through SECURITY DEFINER RPCs
-- (finance.spawn_invoices_from_proposal, finance.record_payment,
-- finance.get_public_invoice, finance.metric_* family, etc.). Direct SELECT/
-- INSERT/UPDATE/DELETE from authenticated returns "permission denied" at the
-- grant check, strictly tighter than the RLS policy would provide.
--
-- This file asserts that posture holds. Richer isolation coverage (per-RPC,
-- per-workspace) should be added by calling the RPCs directly — pre-pilot
-- follow-up, not CI-repair scope.
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

-- ── Tests — each asserts "permission denied at grant level" ──

-- 1. SELECT on finance.invoices is denied.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$SELECT count(*) FROM finance.invoices$$,
  '42501',
  'permission denied for table invoices',
  'Direct SELECT on finance.invoices denied (RPC-only access)'
);
SELECT test_reset_role();

-- 2. INSERT on finance.invoices is denied.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$INSERT INTO finance.invoices (workspace_id, invoice_number, total_amount)
    VALUES ('b1111111-1111-4111-a111-111111111111'::uuid, 'INV-X', 100)$$,
  '42501',
  'permission denied for table invoices',
  'Direct INSERT on finance.invoices denied (RPC-only access)'
);
SELECT test_reset_role();

-- 3. SELECT on finance.payments is denied.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$SELECT count(*) FROM finance.payments$$,
  '42501',
  'permission denied for table payments',
  'Direct SELECT on finance.payments denied (RPC-only access)'
);
SELECT test_reset_role();

-- 4. SELECT on finance.invoice_line_items is denied.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$SELECT count(*) FROM finance.invoice_line_items$$,
  '42501',
  'permission denied for table invoice_line_items',
  'Direct SELECT on finance.invoice_line_items denied (RPC-only access)'
);
SELECT test_reset_role();

SELECT * FROM finish();
ROLLBACK;
