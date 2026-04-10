-- Phase 4: directory.entities RLS policy tests
--
-- Policies under test:
--   "View Directory" (SELECT): owner_workspace_id IS NULL OR owner_workspace_id IN get_my_workspace_ids()
--   "Edit Directory" (ALL):    owner_workspace_id IN get_my_workspace_ids()
BEGIN;
SELECT plan(7);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Reusable helpers (copied from 00000; each file is self-contained within its txn) ──
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
-- Two users in separate workspaces
SELECT test_create_user_in_workspace(
  'a1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid
);
SELECT test_create_user_in_workspace(
  'a2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid
);

-- Entity in workspace 1
INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES ('c1111111-1111-4111-a111-111111111111'::uuid, 'b1111111-1111-4111-a111-111111111111'::uuid, 'person', 'Alice Test');

-- Entity with NULL owner (global/unclaimed)
INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES ('c3333333-3333-4333-a333-333333333333'::uuid, NULL, 'person', 'Global Entity');

-- ── Tests ──

-- 1. User A can see entities in their workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT ok(
  (SELECT count(*) FROM directory.entities WHERE id = 'c1111111-1111-4111-a111-111111111111'::uuid) = 1,
  'User A can see entities in their own workspace'
);
SELECT test_reset_role();

-- 2. User B cannot see entities in User A workspace
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT ok(
  (SELECT count(*) FROM directory.entities WHERE id = 'c1111111-1111-4111-a111-111111111111'::uuid) = 0,
  'User B cannot see entities in User A workspace'
);
SELECT test_reset_role();

-- 3. NULL owner_workspace_id entities are visible to all authenticated users
SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);
SELECT ok(
  (SELECT count(*) FROM directory.entities WHERE id = 'c3333333-3333-4333-a333-333333333333'::uuid) = 1,
  'Entities with NULL owner_workspace_id are visible to all authenticated users'
);
SELECT test_reset_role();

-- 4. User A can INSERT entities in their workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT lives_ok(
  $$INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
    VALUES ('c4444444-4444-4444-a444-444444444444'::uuid, 'b1111111-1111-4111-a111-111111111111'::uuid, 'person', 'New Person')$$,
  'User A can INSERT entities in their own workspace'
);
SELECT test_reset_role();

-- 5. User A cannot INSERT entities in another workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
    VALUES ('c5555555-5555-4555-a555-555555555555'::uuid, 'b2222222-2222-4222-a222-222222222222'::uuid, 'person', 'Intruder')$$,
  'new row violates row-level security policy for table "entities"',
  'User A cannot INSERT entities in another workspace'
);
SELECT test_reset_role();

-- 6. User A can UPDATE entities in their workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT lives_ok(
  $$UPDATE directory.entities SET display_name = 'Alice Updated' WHERE id = 'c1111111-1111-4111-a111-111111111111'::uuid$$,
  'User A can UPDATE entities in their own workspace'
);
SELECT test_reset_role();

-- 7. User A cannot UPDATE entities in another workspace (silently affects 0 rows, not an error)
-- Insert entity in workspace 2 as superuser
INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES ('c6666666-6666-4666-a666-666666666666'::uuid, 'b2222222-2222-4222-a222-222222222222'::uuid, 'person', 'Bob Test');

SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
UPDATE directory.entities SET display_name = 'Hacked' WHERE id = 'c6666666-6666-4666-a666-666666666666'::uuid;
SELECT test_reset_role();
SELECT ok(
  (SELECT display_name FROM directory.entities WHERE id = 'c6666666-6666-4666-a666-666666666666'::uuid) = 'Bob Test',
  'User A cannot UPDATE entities in another workspace (row unchanged)'
);

SELECT * FROM finish();
ROLLBACK;
