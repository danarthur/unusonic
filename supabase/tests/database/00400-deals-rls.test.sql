-- Phase 4: public.deals workspace isolation tests
--
-- Policies under test:
--   deals_workspace_select (SELECT): workspace_id IN (SELECT workspace_id FROM workspace_members WHERE user_id = auth.uid())
--   deals_workspace_insert (INSERT WITH CHECK): same pattern
--   deals_workspace_update (UPDATE): same pattern
--   deals_workspace_delete (DELETE): same pattern
BEGIN;
SELECT plan(4);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers ──
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
SELECT test_create_user_in_workspace(
  'a2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid
);

-- Deal in workspace 1 (inserted as superuser)
INSERT INTO public.deals (id, workspace_id, proposed_date, title, status)
VALUES (
  'f1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  '2026-06-15',
  'Test Wedding',
  'inquiry'
);

-- ── Tests ──

-- 1. User A can see deals in their workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT ok(
  (SELECT count(*) FROM public.deals WHERE id = 'f1111111-1111-4111-a111-111111111111'::uuid) = 1,
  'User A can see deals in their own workspace'
);
SELECT test_reset_role();

-- 2. User B cannot see deals in another workspace
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT ok(
  (SELECT count(*) FROM public.deals WHERE id = 'f1111111-1111-4111-a111-111111111111'::uuid) = 0,
  'User B cannot see deals in User A workspace'
);
SELECT test_reset_role();

-- 3. User A can update deals in their workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT lives_ok(
  $$UPDATE public.deals SET title = 'Updated Wedding' WHERE id = 'f1111111-1111-4111-a111-111111111111'::uuid$$,
  'User A can UPDATE deals in their own workspace'
);
SELECT test_reset_role();

-- 4. User A cannot update deals in another workspace (silently affects 0 rows)
-- Insert a deal in workspace 2 as superuser
INSERT INTO public.deals (id, workspace_id, proposed_date, title, status)
VALUES (
  'f2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  '2026-07-01',
  'Other Deal',
  'inquiry'
);

SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
UPDATE public.deals SET title = 'Hacked' WHERE id = 'f2222222-2222-4222-a222-222222222222'::uuid;
SELECT test_reset_role();
SELECT ok(
  (SELECT title FROM public.deals WHERE id = 'f2222222-2222-4222-a222-222222222222'::uuid) = 'Other Deal',
  'User A cannot UPDATE deals in another workspace (row unchanged)'
);

SELECT * FROM finish();
ROLLBACK;
