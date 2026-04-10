-- Phase 4: pgTAP RLS test helpers
-- Runs first (alphabetical order) to install reusable functions for all test files.
BEGIN;
SELECT plan(1);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Helper: create a test user + workspace + membership
-- Creates the workspace row if it doesn't exist, then auth.users + workspace_members.
CREATE OR REPLACE FUNCTION test_create_user_in_workspace(
  p_user_id uuid,
  p_workspace_id uuid,
  p_role text DEFAULT 'owner'
) RETURNS void AS $$
BEGIN
  -- Ensure the workspace exists
  INSERT INTO public.workspaces (id, name, slug)
  VALUES (p_workspace_id, 'Test Workspace ' || p_workspace_id::text, 'test-' || left(p_workspace_id::text, 8))
  ON CONFLICT (id) DO NOTHING;

  -- Insert auth.users entry
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, created_at, updated_at, confirmation_token)
  VALUES (
    p_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_user_id::text || '@test.local',
    crypt('password', gen_salt('bf')),
    'authenticated',
    'authenticated',
    now(),
    now(),
    ''
  )
  ON CONFLICT (id) DO NOTHING;

  -- Insert workspace membership (composite PK: workspace_id, user_id)
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
  VALUES (p_workspace_id, p_user_id, p_role)
  ON CONFLICT (workspace_id, user_id) DO NOTHING;
END;
$$ LANGUAGE plpgsql;

-- Helper: switch to authenticated user context (sets auth.uid() and role)
CREATE OR REPLACE FUNCTION test_authenticate_as(p_user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user_id::text,
    'role', 'authenticated',
    'email', p_user_id::text || '@test.local'
  )::text, true);
  SET ROLE authenticated;
END;
$$ LANGUAGE plpgsql;

-- Helper: reset to superuser (postgres) for setup between user switches
CREATE OR REPLACE FUNCTION test_reset_role() RETURNS void AS $$
BEGIN
  RESET ROLE;
  PERFORM set_config('request.jwt.claims', '', true);
END;
$$ LANGUAGE plpgsql;

SELECT pass('helpers installed');
SELECT * FROM finish();
ROLLBACK;
