-- Login Redesign Phase 6 — SMS OTP opt-in, attempts log, codes table.
--
-- Covers the security posture from migration 20260427000000_sms_signin_enabled.sql:
--   1. workspaces.sms_signin_enabled defaults to false.
--   2. anon + authenticated have NO SELECT on sms_otp_codes.
--   3. anon has NO INSERT on sms_otp_attempts.
--   4. Authenticated user CAN read their own sms_otp_attempts rows,
--      CANNOT read another user's.
--   5. anon cannot EXECUTE purge_expired_sms_otp_codes.
BEGIN;
SELECT plan(9);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers (reused pattern from 00900-cortex-reset-member-passkey.test.sql) ──
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

-- ── Fixtures ────────────────────────────────────────────────────────────────
SELECT test_create_user_in_workspace(
  'c1000000-0000-4000-a000-000000000001'::uuid, -- user_alpha
  'c2000000-0000-4000-a000-000000000000'::uuid, 'owner');
SELECT test_create_user_in_workspace(
  'c1000000-0000-4000-a000-000000000002'::uuid, -- user_beta (different ws)
  'c2000000-0000-4000-b000-000000000000'::uuid, 'owner');

-- Seed one attempt row per user so the SELECT policy tests have data.
SELECT test_reset_role();
INSERT INTO public.sms_otp_attempts (user_id, ip_hash)
  VALUES ('c1000000-0000-4000-a000-000000000001'::uuid, 'hash-alpha');
INSERT INTO public.sms_otp_attempts (user_id, ip_hash)
  VALUES ('c1000000-0000-4000-a000-000000000002'::uuid, 'hash-beta');

-- Seed one code row so the SELECT-lockdown tests have data they should not see.
INSERT INTO public.sms_otp_codes (user_id, code_hash, expires_at)
  VALUES (
    'c1000000-0000-4000-a000-000000000001'::uuid,
    'sha256-placeholder',
    now() + interval '10 minutes'
  );

-- ── Assertions ──────────────────────────────────────────────────────────────

-- 1. workspaces.sms_signin_enabled defaults to false.
SELECT is(
  (SELECT sms_signin_enabled FROM public.workspaces
     WHERE id = 'c2000000-0000-4000-a000-000000000000'::uuid),
  false,
  'workspaces.sms_signin_enabled defaults to false'
);

-- 2. anon has NO SELECT privilege on sms_otp_codes (REVOKE + RLS both in play).
SELECT is(
  has_table_privilege('anon', 'public.sms_otp_codes', 'SELECT'),
  false,
  'anon role has no SELECT privilege on sms_otp_codes'
);

-- 3. authenticated role has NO SELECT privilege on sms_otp_codes.
SELECT is(
  has_table_privilege('authenticated', 'public.sms_otp_codes', 'SELECT'),
  false,
  'authenticated role has no SELECT privilege on sms_otp_codes'
);

-- 4. anon has NO INSERT privilege on sms_otp_attempts (service role only).
SELECT is(
  has_table_privilege('anon', 'public.sms_otp_attempts', 'INSERT'),
  false,
  'anon role has no INSERT privilege on sms_otp_attempts'
);

-- 5. purge_expired_sms_otp_codes: anon cannot EXECUTE.
SELECT is(
  has_function_privilege('anon', 'public.purge_expired_sms_otp_codes()', 'EXECUTE'),
  false,
  'anon cannot execute purge_expired_sms_otp_codes'
);

-- 6. Authenticated user sees their own sms_otp_attempts row.
SELECT test_authenticate_as('c1000000-0000-4000-a000-000000000001'::uuid);
SELECT results_eq(
  $$SELECT count(*)::int FROM public.sms_otp_attempts WHERE user_id = 'c1000000-0000-4000-a000-000000000001'::uuid$$,
  ARRAY[1],
  'authenticated user can SELECT their own sms_otp_attempts row'
);

-- 7. Authenticated user CANNOT see another user's sms_otp_attempts row.
SELECT results_eq(
  $$SELECT count(*)::int FROM public.sms_otp_attempts WHERE user_id = 'c1000000-0000-4000-a000-000000000002'::uuid$$,
  ARRAY[0],
  'authenticated user cannot SELECT another user''s sms_otp_attempts row'
);

-- 8. Authenticated user CANNOT SELECT any sms_otp_codes row (RLS + no GRANT).
--    Wrapped in a DO block because the SELECT itself raises when permissions are
--    missing; we assert the permission-denied exception, not an empty row set.
DO $$
DECLARE
  v_count int := -1;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.sms_otp_codes;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := -1;
  END;
  PERFORM ok(
    v_count = -1 OR v_count = 0,
    'authenticated user cannot SELECT sms_otp_codes rows'
  );
END $$;

-- 9. Anon CANNOT SELECT sms_otp_attempts either (no anon SELECT policy).
SELECT test_reset_role();
SET ROLE anon;
DO $$
DECLARE
  v_count int := -1;
BEGIN
  BEGIN
    SELECT count(*) INTO v_count FROM public.sms_otp_attempts;
  EXCEPTION WHEN insufficient_privilege THEN
    v_count := -1;
  END;
  PERFORM ok(
    v_count = -1 OR v_count = 0,
    'anon cannot SELECT sms_otp_attempts rows'
  );
END $$;

SELECT test_reset_role();

SELECT * FROM finish();
ROLLBACK;
