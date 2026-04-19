-- Login Redesign Phase 1 — cortex.reset_member_passkey
--
-- Covers the authorization + side-effect contract documented in
-- docs/reference/login-redesign-design.md §9. Admin-only; anti-lockout;
-- wipes passkeys; writes an ADMIN_ACTION edge; anon cannot execute.
BEGIN;
SELECT plan(9);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers (same inline pattern as 00200-cortex-write-protection.test.sql) ──
CREATE OR REPLACE FUNCTION test_create_user_in_workspace(
  p_user_id uuid,
  p_workspace_id uuid,
  p_role text DEFAULT 'owner'
) RETURNS void AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, slug)
    VALUES (p_workspace_id, 'WS ' || p_workspace_id::text, 'ws-' || left(p_workspace_id::text, 8))
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, created_at, updated_at, confirmation_token)
    VALUES (p_user_id, '00000000-0000-0000-0000-000000000000', p_user_id::text || '@test.local', crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now(), now(), '')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (p_workspace_id, p_user_id, p_role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_authenticate_as(p_user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user_id::text,
    'role', 'authenticated',
    'email', p_user_id::text || '@test.local'
  )::text, true);
  SET ROLE authenticated;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_reset_role() RETURNS void AS $$
BEGIN RESET ROLE; PERFORM set_config('request.jwt.claims', '', true); END; $$ LANGUAGE plpgsql;

-- ── Workspaces + users ─────────────────────────────────────────────────────
-- ws_a with admin_a + member_a1 (has passkeys) + member_a2 (no passkeys)
-- ws_b with admin_b + member_b1

SELECT test_create_user_in_workspace(
  'a0000000-0000-4000-a000-000000000001'::uuid,                   -- admin_a
  'b0000000-0000-4000-a000-000000000000'::uuid, 'admin');
SELECT test_create_user_in_workspace(
  'a0000000-0000-4000-a000-000000000002'::uuid,                   -- member_a1
  'b0000000-0000-4000-a000-000000000000'::uuid, 'member');
SELECT test_create_user_in_workspace(
  'a0000000-0000-4000-a000-000000000003'::uuid,                   -- member_a2 (no passkeys)
  'b0000000-0000-4000-a000-000000000000'::uuid, 'member');

SELECT test_create_user_in_workspace(
  'a0000000-0000-4000-b000-000000000001'::uuid,                   -- admin_b (other ws)
  'b0000000-0000-4000-b000-000000000000'::uuid, 'admin');
SELECT test_create_user_in_workspace(
  'a0000000-0000-4000-b000-000000000002'::uuid,                   -- member_b1
  'b0000000-0000-4000-b000-000000000000'::uuid, 'member');

-- Directory entities (claimed_by_user_id → caller/target lookup)
INSERT INTO directory.entities (id, owner_workspace_id, type, display_name, claimed_by_user_id) VALUES
  ('c0000000-0000-4000-a000-000000000001'::uuid, 'b0000000-0000-4000-a000-000000000000'::uuid, 'person', 'Admin A',    'a0000000-0000-4000-a000-000000000001'::uuid),
  ('c0000000-0000-4000-a000-000000000002'::uuid, 'b0000000-0000-4000-a000-000000000000'::uuid, 'person', 'Member A1',  'a0000000-0000-4000-a000-000000000002'::uuid),
  ('c0000000-0000-4000-a000-000000000003'::uuid, 'b0000000-0000-4000-a000-000000000000'::uuid, 'person', 'Member A2',  'a0000000-0000-4000-a000-000000000003'::uuid),
  ('c0000000-0000-4000-b000-000000000001'::uuid, 'b0000000-0000-4000-b000-000000000000'::uuid, 'person', 'Admin B',    'a0000000-0000-4000-b000-000000000001'::uuid),
  ('c0000000-0000-4000-b000-000000000002'::uuid, 'b0000000-0000-4000-b000-000000000000'::uuid, 'person', 'Member B1',  'a0000000-0000-4000-b000-000000000002'::uuid)
ON CONFLICT (id) DO NOTHING;

-- Passkeys: member_a1 has 2 rows; member_a2 has 0; member_b1 has 1.
INSERT INTO public.passkeys (id, user_id, credential_id, public_key, counter, transports) VALUES
  ('d0000000-0000-4000-a000-000000000001'::uuid, 'a0000000-0000-4000-a000-000000000002'::uuid, 'cred-a1-1', 'pk-a1-1', 0, ARRAY['internal']::text[]),
  ('d0000000-0000-4000-a000-000000000002'::uuid, 'a0000000-0000-4000-a000-000000000002'::uuid, 'cred-a1-2', 'pk-a1-2', 0, ARRAY['hybrid']::text[]),
  ('d0000000-0000-4000-b000-000000000001'::uuid, 'a0000000-0000-4000-b000-000000000002'::uuid, 'cred-b1-1', 'pk-b1-1', 0, ARRAY['internal']::text[])
ON CONFLICT (id) DO NOTHING;

-- ── Tests ──────────────────────────────────────────────────────────────────

-- 1. Admin of ws_a CAN reset member_a1 of ws_a. Returns target email + count.
SELECT test_authenticate_as('a0000000-0000-4000-a000-000000000001'::uuid);
SELECT is(
  (SELECT cortex.reset_member_passkey(
    'b0000000-0000-4000-a000-000000000000'::uuid,
    'a0000000-0000-4000-a000-000000000002'::uuid
  ) ->> 'passkeys_deleted'),
  '2',
  'admin of ws_a resets member_a1 and gets passkeys_deleted=2'
);
SELECT test_reset_role();

-- 2. The passkeys for member_a1 are gone.
SELECT is(
  (SELECT count(*)::int FROM public.passkeys WHERE user_id = 'a0000000-0000-4000-a000-000000000002'::uuid),
  0,
  'member_a1 passkeys were deleted'
);

-- 3. An ADMIN_ACTION edge was written from admin_a to member_a1.
SELECT is(
  (SELECT count(*)::int FROM cortex.relationships
    WHERE source_entity_id  = 'c0000000-0000-4000-a000-000000000001'::uuid
      AND target_entity_id  = 'c0000000-0000-4000-a000-000000000002'::uuid
      AND relationship_type = 'ADMIN_ACTION'
      AND context_data ->> 'action' = 'reset_member_passkey'),
  1,
  'ADMIN_ACTION edge was written for the reset'
);

-- 4. Resetting a member with no passkeys returns passkeys_deleted=0 successfully.
SELECT test_authenticate_as('a0000000-0000-4000-a000-000000000001'::uuid);
SELECT is(
  (SELECT cortex.reset_member_passkey(
    'b0000000-0000-4000-a000-000000000000'::uuid,
    'a0000000-0000-4000-a000-000000000003'::uuid
  ) ->> 'passkeys_deleted'),
  '0',
  'resetting a member with no passkeys returns 0 and does not raise'
);
SELECT test_reset_role();

-- 5. Non-admin member of ws_a CANNOT reset another member (ERRCODE 42501).
SELECT test_authenticate_as('a0000000-0000-4000-a000-000000000002'::uuid);
SELECT throws_ok(
  $$SELECT cortex.reset_member_passkey(
    'b0000000-0000-4000-a000-000000000000'::uuid,
    'a0000000-0000-4000-a000-000000000003'::uuid
  )$$,
  '42501',
  NULL,
  'non-admin cannot reset another member (42501)'
);
SELECT test_reset_role();

-- 6. Admin of ws_a CANNOT reset a member of ws_b (cross-workspace).
--    Caller fails the owner/admin check in ws_b before the membership check.
SELECT test_authenticate_as('a0000000-0000-4000-a000-000000000001'::uuid);
SELECT throws_ok(
  $$SELECT cortex.reset_member_passkey(
    'b0000000-0000-4000-b000-000000000000'::uuid,
    'a0000000-0000-4000-b000-000000000002'::uuid
  )$$,
  '42501',
  NULL,
  'admin of ws_a cannot reset a member of ws_b (42501)'
);
SELECT test_reset_role();

-- 6a. And the ws_b passkey survived (no side effect from the rejected call).
SELECT is(
  (SELECT count(*)::int FROM public.passkeys WHERE user_id = 'a0000000-0000-4000-b000-000000000002'::uuid),
  1,
  'cross-workspace rejection left ws_b passkeys intact'
);

-- 7. Admin cannot reset themselves (anti-lockout).
SELECT test_authenticate_as('a0000000-0000-4000-a000-000000000001'::uuid);
SELECT throws_ok(
  $$SELECT cortex.reset_member_passkey(
    'b0000000-0000-4000-a000-000000000000'::uuid,
    'a0000000-0000-4000-a000-000000000001'::uuid
  )$$,
  '42501',
  NULL,
  'admin cannot reset their own passkeys (42501 anti-lockout)'
);
SELECT test_reset_role();

-- 8. anon does NOT hold EXECUTE on the function (grants audit).
SELECT is(
  has_function_privilege('anon', 'cortex.reset_member_passkey(uuid,uuid)', 'EXECUTE'),
  false,
  'anon cannot EXECUTE cortex.reset_member_passkey'
);

SELECT * FROM finish();
ROLLBACK;
