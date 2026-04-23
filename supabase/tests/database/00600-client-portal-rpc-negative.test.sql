-- Client Portal: negative tests for client_* SECURITY DEFINER RPCs
--
-- Functions under test:
--   public.client_revoke_all_for_entity(entity_id, workspace_id, revoked_by, reason)
--   public.client_revoke_session_token_device(workspace_id, entity_id, session_id, revoked_by, reason)
--
-- Both are SECURITY DEFINER and marked for dashboard use (staff members
-- kicking client sessions). Both currently validate that the passed
-- (entity_id, workspace_id) pair is internally consistent
-- (entity.owner_workspace_id = p_workspace_id) but do NOT validate that
-- auth.uid() — the caller — is actually a member of p_workspace_id.
--
-- Threat model: an authenticated user in workspace A could call these
-- RPCs with a (workspace B entity, workspace B id) tuple and revoke
-- real client sessions in workspace B, locking the clients out of their
-- portal or forcing re-auth. This is the "RPC-bypass hole that RLS alone
-- can't catch" from client-portal-design.md §16.3a(2).
--
-- Two of the four assertions in this file WILL FAIL against the current
-- (unguarded) RPC implementations. That's the point — the test is the
-- proof of the vulnerability. Once the companion migration adds the
-- is_workspace_member() guard, all four assertions pass. This is the
-- classic red-green-refactor pattern for security regressions.

BEGIN;
SELECT plan(4);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers ──────────────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION test_create_user_in_workspace(p_user_id uuid, p_workspace_id uuid, p_role text DEFAULT 'owner') RETURNS void AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, slug)
  VALUES (p_workspace_id, 'WS ' || p_workspace_id::text, 'ws-' || p_workspace_id::text)
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

-- ── Test data ────────────────────────────────────────────────────────────
-- Two workspaces, each with a staff member and a client entity.
-- Each client has one active session token.

-- Workspace A: staff user + client entity + active token
SELECT test_create_user_in_workspace(
  'a1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid
);

INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES (
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'person',
  'Client A'
);

INSERT INTO public.client_portal_tokens (id, entity_id, token_hash, source_kind, expires_at)
VALUES (
  '11111111-1111-4111-a111-111111111111'::uuid,
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'hash_a_' || gen_random_uuid()::text,
  'proposal',
  now() + interval '30 days'
);

-- Workspace B: staff user + client entity + active token
SELECT test_create_user_in_workspace(
  'a2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid
);

INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
VALUES (
  'c2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  'person',
  'Client B'
);

INSERT INTO public.client_portal_tokens (id, entity_id, token_hash, source_kind, expires_at)
VALUES (
  '22222222-2222-4222-a222-222222222222'::uuid,
  'c2222222-2222-4222-a222-222222222222'::uuid,
  'hash_b_' || gen_random_uuid()::text,
  'proposal',
  now() + interval '30 days'
);

-- ── Tests — Workspace A member attacking Workspace B sessions ───────────

-- Authenticate as workspace A staff user
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);

-- 1. client_revoke_all_for_entity — cross-workspace attempt should either
--    throw or revoke 0 rows. Passing the correct (B entity, B workspace)
--    pair bypasses the internal consistency check; the only remaining
--    guard is the caller's workspace membership.
--
-- Expected behavior after fix: function raises or returns 0.
-- Current (vulnerable) behavior: returns 1 (revokes B's session).
DO $$
DECLARE
  v_revoked integer;
BEGIN
  BEGIN
    v_revoked := public.client_revoke_all_for_entity(
      'c2222222-2222-4222-a222-222222222222'::uuid,  -- B's entity
      'b2222222-2222-4222-a222-222222222222'::uuid,  -- B's workspace
      'a1111111-1111-4111-a111-111111111111'::uuid,  -- A's user as revoker
      'test_cross_workspace_attack'
    );
    -- Stash the result for the assertion below
    PERFORM set_config('test.revoke_all_result', v_revoked::text, true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('test.revoke_all_result', 'threw', true);
  END;
END $$;

SELECT ok(
  current_setting('test.revoke_all_result') IN ('0','threw'),
  'client_revoke_all_for_entity refuses cross-workspace call (returns 0 or throws)'
);

-- 2. Verify B's session is still active (the real-world consequence check)
SELECT test_reset_role();
SELECT ok(
  (SELECT revoked_at FROM public.client_portal_tokens WHERE id = '22222222-2222-4222-a222-222222222222'::uuid) IS NULL,
  'Workspace B token remains unrevoked after the attack attempt'
);

-- Reset so the next attack attempt also runs as workspace A user
SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);

-- 3. client_revoke_session_token_device — same attack, surgical variant
DO $$
DECLARE
  v_result boolean;
BEGIN
  BEGIN
    v_result := public.client_revoke_session_token_device(
      'b2222222-2222-4222-a222-222222222222'::uuid,  -- B's workspace
      'c2222222-2222-4222-a222-222222222222'::uuid,  -- B's entity
      '22222222-2222-4222-a222-222222222222'::uuid,  -- B's token
      'a1111111-1111-4111-a111-111111111111'::uuid,  -- A's user as revoker
      'test_cross_workspace_attack'
    );
    PERFORM set_config('test.revoke_device_result', CASE WHEN v_result THEN 'true' ELSE 'false' END, true);
  EXCEPTION WHEN OTHERS THEN
    PERFORM set_config('test.revoke_device_result', 'threw', true);
  END;
END $$;

SELECT ok(
  current_setting('test.revoke_device_result') IN ('false','threw'),
  'client_revoke_session_token_device refuses cross-workspace call (returns false or throws)'
);

-- 4. Final state check — B's token still unrevoked
SELECT test_reset_role();
SELECT ok(
  (SELECT revoked_at FROM public.client_portal_tokens WHERE id = '22222222-2222-4222-a222-222222222222'::uuid) IS NULL,
  'Workspace B token still unrevoked after both attack attempts'
);

SELECT * FROM finish();
ROLLBACK;
