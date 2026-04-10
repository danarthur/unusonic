-- Phase 4: finance.invoices workspace isolation tests
--
-- Policy under test:
--   "Workspace Finance" (ALL): workspace_id IN (SELECT get_my_workspace_ids())
BEGIN;
SELECT plan(4);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers ──
CREATE OR REPLACE FUNCTION test_create_user_in_workspace(p_user_id uuid, p_workspace_id uuid, p_role text DEFAULT 'owner') RETURNS void AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, slug) VALUES (p_workspace_id, 'WS ' || p_workspace_id::text, 'ws-' || left(p_workspace_id::text, 8)) ON CONFLICT (id) DO NOTHING;
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
SELECT test_create_user_in_workspace(
  'a2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid
);

-- Entity for bill_to FK (in workspace 1)
INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES ('c1111111-1111-4111-a111-111111111111'::uuid, 'b1111111-1111-4111-a111-111111111111'::uuid, 'company', 'Client Co');

-- Invoice in workspace 1 (inserted as superuser)
INSERT INTO finance.invoices (id, workspace_id, bill_to_entity_id, invoice_number, total_amount)
VALUES (
  'e1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'INV-001',
  5000.00
);

-- ── Tests ──

-- 1. User A can see invoices in their workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT ok(
  (SELECT count(*) FROM finance.invoices WHERE id = 'e1111111-1111-4111-a111-111111111111'::uuid) = 1,
  'User A can see invoices in their own workspace'
);
SELECT test_reset_role();

-- 2. User B cannot see invoices in another workspace
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT ok(
  (SELECT count(*) FROM finance.invoices WHERE id = 'e1111111-1111-4111-a111-111111111111'::uuid) = 0,
  'User B cannot see invoices in User A workspace'
);
SELECT test_reset_role();

-- 3. User A can insert invoices in their workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT lives_ok(
  $$INSERT INTO finance.invoices (id, workspace_id, bill_to_entity_id, invoice_number, total_amount)
    VALUES ('e3333333-3333-4333-a333-333333333333'::uuid, 'b1111111-1111-4111-a111-111111111111'::uuid, 'c1111111-1111-4111-a111-111111111111'::uuid, 'INV-002', 3000.00)$$,
  'User A can INSERT invoices in their own workspace'
);
SELECT test_reset_role();

-- 4. User A cannot insert invoices in another workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$INSERT INTO finance.invoices (id, workspace_id, bill_to_entity_id, invoice_number, total_amount)
    VALUES ('e4444444-4444-4444-a444-444444444444'::uuid, 'b2222222-2222-4222-a222-222222222222'::uuid, 'c1111111-1111-4111-a111-111111111111'::uuid, 'INV-003', 1000.00)$$,
  'new row violates row-level security policy for table "invoices"',
  'User A cannot INSERT invoices in another workspace'
);
SELECT test_reset_role();

SELECT * FROM finish();
ROLLBACK;
