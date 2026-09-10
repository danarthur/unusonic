-- Private notes belong to the workspace that wrote them, and to no machine.
--
-- They used to live in `public.org_private_data`, keyed
-- (owner_org_id, subject_org_id) -- a table that does not exist, so the write
-- 404'd and what somebody typed about a client was discarded behind a generic
-- failure. They are now a column on `directory.entity_working_notes`, written
-- through the same SECURITY DEFINER RPC as the rest of that row.
--
-- Two rules are worth holding still:
--
--   * A capture may not write one. The other three fields are observations
--     Aion can defensibly draw from a transcript; a private note is the
--     owner's own words about somebody, and a machine filling it in is the
--     shape of the grounding defect that got the generated brief deleted.
--
--   * A patch touches only what it names. NULL leaves a field alone and ''
--     clears it, so saving a note must not wipe the DNR flag beside it.

BEGIN;
SELECT plan(7);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE OR REPLACE FUNCTION test_create_user_in_workspace(
  p_user_id uuid, p_workspace_id uuid, p_role text DEFAULT 'owner'
) RETURNS void AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, slug)
    VALUES (p_workspace_id, 'WS ' || p_workspace_id::text, 'ws-' || p_workspace_id::text)
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, created_at, updated_at, confirmation_token)
    VALUES (p_user_id, '00000000-0000-0000-0000-000000000000', p_user_id::text || '@test.local',
            crypt('password', gen_salt('bf')), 'authenticated', 'authenticated', now(), now(), '')
    ON CONFLICT (id) DO NOTHING;
  INSERT INTO public.workspace_members (workspace_id, user_id, role)
    VALUES (p_workspace_id, p_user_id, p_role)
    ON CONFLICT (workspace_id, user_id) DO NOTHING;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_authenticate_as(p_user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims',
    json_build_object('sub', p_user_id::text, 'role', 'authenticated')::text, true);
END; $$ LANGUAGE plpgsql;

-- Fixtures: one workspace with an owner and a company, and a second workspace
-- whose member has no business writing notes on the first one's contact.
DO $$
DECLARE
  v_ws  uuid := '11111111-1111-1111-1111-111111111111';
  v_ws2 uuid := '22222222-2222-2222-2222-222222222222';
  v_u   uuid := '33333333-3333-3333-3333-333333333333';
  v_u2  uuid := '44444444-4444-4444-4444-444444444444';
  v_ent uuid := '55555555-5555-5555-5555-555555555555';
BEGIN
  PERFORM test_create_user_in_workspace(v_u, v_ws);
  PERFORM test_create_user_in_workspace(v_u2, v_ws2);
  INSERT INTO directory.entities (id, owner_workspace_id, type, display_name)
    VALUES (v_ent, v_ws, 'company', 'Acme Rentals')
    ON CONFLICT (id) DO NOTHING;
END $$;

SELECT test_authenticate_as('33333333-3333-3333-3333-333333333333');

-- 1. A member can write a private note.
SELECT is(
  directory.upsert_entity_working_notes(
    p_workspace_id => '11111111-1111-1111-1111-111111111111',
    p_entity_id    => '55555555-5555-5555-5555-555555555555',
    p_private_notes => 'Prefers a call before the invoice goes out.'),
  true,
  'a workspace member can write a private note'
);

SELECT is(
  (SELECT private_notes FROM directory.entity_working_notes
    WHERE workspace_id = '11111111-1111-1111-1111-111111111111'
      AND entity_id = '55555555-5555-5555-5555-555555555555'),
  'Prefers a call before the invoice goes out.',
  'the note reads back'
);

-- 2. A capture may not write one.
SELECT is(
  directory.upsert_entity_working_notes(
    p_workspace_id => '11111111-1111-1111-1111-111111111111',
    p_entity_id    => '55555555-5555-5555-5555-555555555555',
    p_private_notes => 'inferred by a machine',
    p_source        => 'capture'),
  false,
  'a capture cannot write a private note'
);

SELECT is(
  (SELECT private_notes FROM directory.entity_working_notes
    WHERE workspace_id = '11111111-1111-1111-1111-111111111111'
      AND entity_id = '55555555-5555-5555-5555-555555555555'),
  'Prefers a call before the invoice goes out.',
  'the refused capture left the note alone'
);

-- 3. A patch touches only what it names.
SELECT lives_ok($$
  SELECT directory.upsert_entity_working_notes(
    p_workspace_id => '11111111-1111-1111-1111-111111111111',
    p_entity_id    => '55555555-5555-5555-5555-555555555555',
    p_dnr_flagged  => true, p_dnr_reason => 'paid_late')
$$, 'flagging DNR alongside an existing note succeeds');

SELECT is(
  (SELECT private_notes || ' / ' || dnr_reason FROM directory.entity_working_notes
    WHERE workspace_id = '11111111-1111-1111-1111-111111111111'
      AND entity_id = '55555555-5555-5555-5555-555555555555'),
  'Prefers a call before the invoice goes out. / paid_late',
  'writing DNR did not clear the note beside it'
);

-- 4. Someone else's workspace cannot write on this contact.
SELECT test_authenticate_as('44444444-4444-4444-4444-444444444444');
SELECT is(
  directory.upsert_entity_working_notes(
    p_workspace_id => '11111111-1111-1111-1111-111111111111',
    p_entity_id    => '55555555-5555-5555-5555-555555555555',
    p_private_notes => 'from another workspace'),
  false,
  'a non-member cannot write a private note on this workspace''s contact'
);

SELECT * FROM finish();
ROLLBACK;
