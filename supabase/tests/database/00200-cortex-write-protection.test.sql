-- Phase 4: cortex.relationships write-protection tests
--
-- Policies under test:
--   "View Graph" (SELECT): source_entity_id IN (SELECT id FROM directory.entities WHERE owner_workspace_id IN get_my_workspace_ids())
--   No INSERT/UPDATE/DELETE policies — all writes via upsert_relationship() RPC
BEGIN;
SELECT plan(7);

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

-- Entities in workspace 1
INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES
  ('c1111111-1111-4111-a111-111111111111'::uuid, 'b1111111-1111-4111-a111-111111111111'::uuid, 'person', 'Person A1'),
  ('c1111111-1111-4111-a111-222222222222'::uuid, 'b1111111-1111-4111-a111-111111111111'::uuid, 'company', 'Company A1');

-- Entity in workspace 2
INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES ('c2222222-2222-4222-a222-111111111111'::uuid, 'b2222222-2222-4222-a222-222222222222'::uuid, 'person', 'Person B1');

-- Relationship between entities in workspace 1 (inserted as superuser)
INSERT INTO cortex.relationships (id, source_entity_id, target_entity_id, relationship_type, context_data)
VALUES (
  'd1111111-1111-4111-a111-111111111111'::uuid,
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'c1111111-1111-4111-a111-222222222222'::uuid,
  'EMPLOYEE',
  '{}'::jsonb
);

-- Relationship sourced from workspace 2
INSERT INTO cortex.relationships (id, source_entity_id, target_entity_id, relationship_type, context_data)
VALUES (
  'd2222222-2222-4222-a222-111111111111'::uuid,
  'c2222222-2222-4222-a222-111111111111'::uuid,
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'INDUSTRY_PARTNER',
  '{}'::jsonb
);

-- ── Tests ──

-- 1. User A can SELECT relationships for entities in their workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT ok(
  (SELECT count(*) FROM cortex.relationships WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid) = 1,
  'User A can SELECT relationships sourced from their workspace'
);
SELECT test_reset_role();

-- 2. User A cannot SELECT relationships sourced from another workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT ok(
  (SELECT count(*) FROM cortex.relationships WHERE id = 'd2222222-2222-4222-a222-111111111111'::uuid) = 0,
  'User A cannot SELECT relationships sourced from another workspace'
);
SELECT test_reset_role();

-- 3. Direct INSERT into cortex.relationships is REJECTED.
-- Per CLAUDE.md #3: cortex.relationships has no INSERT/UPDATE/DELETE RLS —
-- the grant posture itself denies writes (service_role only). So the error
-- is "permission denied", not an RLS-violation message. Either form is a
-- valid rejection; we match on "permission denied" since that's what prod
-- returns.
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type)
    VALUES ('c1111111-1111-4111-a111-111111111111'::uuid, 'c1111111-1111-4111-a111-222222222222'::uuid, 'CONTACT')$$,
  '42501',
  'permission denied for table relationships',
  'Direct INSERT into cortex.relationships is rejected'
);
SELECT test_reset_role();

-- 4. Direct UPDATE on cortex.relationships is REJECTED (grant posture).
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$UPDATE cortex.relationships SET relationship_type = 'HACKED' WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid$$,
  '42501',
  'permission denied for table relationships',
  'Direct UPDATE on cortex.relationships is rejected'
);
SELECT test_reset_role();

-- 5. Direct DELETE on cortex.relationships is REJECTED (grant posture).
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$DELETE FROM cortex.relationships WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid$$,
  '42501',
  'permission denied for table relationships',
  'Direct DELETE on cortex.relationships is rejected'
);
SELECT test_reset_role();

-- 6. upsert_relationship() RPC succeeds when source entity is in caller workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT lives_ok(
  $$SELECT upsert_relationship(
    'c1111111-1111-4111-a111-111111111111'::uuid,
    'c1111111-1111-4111-a111-222222222222'::uuid,
    'CONTACT',
    '{}'::jsonb
  )$$,
  'upsert_relationship() succeeds when source entity is in caller workspace'
);
SELECT test_reset_role();

-- 7. upsert_relationship() RPC fails when source entity is NOT in caller workspace
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);
SELECT throws_ok(
  $$SELECT upsert_relationship(
    'c2222222-2222-4222-a222-111111111111'::uuid,
    'c1111111-1111-4111-a111-111111111111'::uuid,
    'CONTACT',
    '{}'::jsonb
  )$$,
  'access denied: source entity not in caller workspace',
  'upsert_relationship() fails when source entity is NOT in caller workspace'
);
SELECT test_reset_role();

SELECT * FROM finish();
ROLLBACK;
