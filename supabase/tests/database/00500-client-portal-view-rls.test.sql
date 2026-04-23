-- Client Portal: claimed-client view RLS isolation
--
-- Policies under test (all SELECT-only, added in migration 20260410100000):
--   finance.invoices        — client_view_own_invoices
--   ops.events              — client_view_own_events
--   ops.projects            — client_view_own_projects
--   public.proposals        — client_view_own_proposals (joins via deals→events)
--
-- Threat model: a claimed client (Supabase auth user with directory.entities
-- row where claimed_by_user_id = auth.uid()) must only see resources tied to
-- their own entity. Crossing workspaces — even if the attacker knows the
-- exact UUID of a resource in another workspace — must return zero rows.
--
-- This is the mandatory CI gate per client-portal-design.md §16.3a(1). It
-- was written immediately after the Phase B verification caught an IDOR
-- hole in /client/invoice/[id] where the app-level query was missing the
-- bill_to_entity_id isolation check. Fixing that in app code was
-- necessary but not sufficient — the test below locks the guarantee down
-- at the DB layer so no future app code can re-open it.
--
-- NOTE: This suite only covers **claimed** clients. Anonymous cookie-only
-- sessions don't have an auth.uid(), so get_my_client_entity_ids() returns
-- empty and these policies deny everything. Anonymous-path isolation is
-- enforced by the server-side helpers that query via service_role and
-- add their own bill_to_entity_id / client_entity_id scoping — those will
-- be covered by a separate suite (see §16.3a(2)/(3)).

BEGIN;
SELECT plan(12);

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ── Helpers ──────────────────────────────────────────────────────────────

-- Create an auth.users row for a client (NOT a workspace member — clients
-- are counterparties, not staff, per client-portal-design.md §3 principle 7).
CREATE OR REPLACE FUNCTION test_create_auth_user(p_user_id uuid) RETURNS void AS $$
BEGIN
  INSERT INTO auth.users (id, instance_id, email, encrypted_password, aud, role, created_at, updated_at, confirmation_token)
  VALUES (
    p_user_id,
    '00000000-0000-0000-0000-000000000000',
    p_user_id::text || '@client.test.local',
    crypt('password', gen_salt('bf')),
    'authenticated',
    'authenticated',
    now(), now(), ''
  )
  ON CONFLICT (id) DO NOTHING;
END; $$ LANGUAGE plpgsql;

-- Create a workspace without adding the client as a member — the client
-- portal threat model explicitly treats clients as NOT workspace_members.
CREATE OR REPLACE FUNCTION test_create_workspace(p_workspace_id uuid) RETURNS void AS $$
BEGIN
  INSERT INTO public.workspaces (id, name, slug)
  VALUES (
    p_workspace_id,
    'WS ' || p_workspace_id::text,
    'ws-' || p_workspace_id::text
  )
  ON CONFLICT (id) DO NOTHING;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_authenticate_as(p_user_id uuid) RETURNS void AS $$
BEGIN
  PERFORM set_config('request.jwt.claims', json_build_object(
    'sub', p_user_id::text,
    'role', 'authenticated',
    'email', p_user_id::text || '@client.test.local'
  )::text, true);
  SET ROLE authenticated;
END; $$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION test_reset_role() RETURNS void AS $$
BEGIN RESET ROLE; PERFORM set_config('request.jwt.claims', '', true); END; $$ LANGUAGE plpgsql;

-- ── Test data ────────────────────────────────────────────────────────────
--
-- Two entirely separate workspaces. Each has a single claimed client entity,
-- one event, one project, one deal, one proposal, one invoice.
--
-- Fixed UUIDs: A rows start with a111.../b111.../c111.../d111.../e111.../f111...
--              B rows start with a222.../b222.../c222.../d222.../e222.../f222...

-- Workspace A setup
SELECT test_create_workspace('b1111111-1111-4111-a111-111111111111'::uuid);
SELECT test_create_auth_user('a1111111-1111-4111-a111-111111111111'::uuid);

-- Client entity in workspace A, claimed by user A
INSERT INTO directory.entities (id, owner_workspace_id, type, display_name, claimed_by_user_id)
VALUES (
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'person',
  'Client A',
  'a1111111-1111-4111-a111-111111111111'::uuid
);

-- Event in workspace A, linked to client A
INSERT INTO ops.events (id, workspace_id, title, starts_at, ends_at, client_entity_id, status)
VALUES (
  'd1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'Wedding A',
  '2026-06-01 18:00:00+00',
  '2026-06-01 23:00:00+00',
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'planned'
);

-- Project in workspace A, linked to client A
INSERT INTO ops.projects (id, workspace_id, name, client_entity_id)
VALUES (
  'd1a11111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'Project A',
  'c1111111-1111-4111-a111-111111111111'::uuid
);

-- Deal linked to the event (so the proposals join chain works)
INSERT INTO public.deals (id, workspace_id, proposed_date, title, status, event_id)
VALUES (
  'e1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  '2026-06-01',
  'Deal A',
  'won',
  'd1111111-1111-4111-a111-111111111111'::uuid
);

-- Proposal for Deal A
INSERT INTO public.proposals (id, workspace_id, deal_id, status)
VALUES (
  'f1111111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'e1111111-1111-4111-a111-111111111111'::uuid,
  'viewed'
);

-- Invoice billed to Client A
INSERT INTO finance.invoices (id, workspace_id, bill_to_entity_id, invoice_number, total_amount)
VALUES (
  'f1a11111-1111-4111-a111-111111111111'::uuid,
  'b1111111-1111-4111-a111-111111111111'::uuid,
  'c1111111-1111-4111-a111-111111111111'::uuid,
  'INV-A-001',
  5000.00
);

-- Workspace B setup (mirror of A with b222.../c222.../etc)
SELECT test_create_workspace('b2222222-2222-4222-a222-222222222222'::uuid);
SELECT test_create_auth_user('a2222222-2222-4222-a222-222222222222'::uuid);

INSERT INTO directory.entities (id, owner_workspace_id, type, display_name, claimed_by_user_id)
VALUES (
  'c2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  'person',
  'Client B',
  'a2222222-2222-4222-a222-222222222222'::uuid
);

INSERT INTO ops.events (id, workspace_id, title, starts_at, ends_at, client_entity_id, status)
VALUES (
  'd2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  'Wedding B',
  '2026-07-01 18:00:00+00',
  '2026-07-01 23:00:00+00',
  'c2222222-2222-4222-a222-222222222222'::uuid,
  'planned'
);

INSERT INTO ops.projects (id, workspace_id, name, client_entity_id)
VALUES (
  'd2a22222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  'Project B',
  'c2222222-2222-4222-a222-222222222222'::uuid
);

INSERT INTO public.deals (id, workspace_id, proposed_date, title, status, event_id)
VALUES (
  'e2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  '2026-07-01',
  'Deal B',
  'won',
  'd2222222-2222-4222-a222-222222222222'::uuid
);

INSERT INTO public.proposals (id, workspace_id, deal_id, status)
VALUES (
  'f2222222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  'e2222222-2222-4222-a222-222222222222'::uuid,
  'viewed'
);

INSERT INTO finance.invoices (id, workspace_id, bill_to_entity_id, invoice_number, total_amount)
VALUES (
  'f2a22222-2222-4222-a222-222222222222'::uuid,
  'b2222222-2222-4222-a222-222222222222'::uuid,
  'c2222222-2222-4222-a222-222222222222'::uuid,
  'INV-B-001',
  7500.00
);

-- ── Tests — Client A perspective ─────────────────────────────────────────

SELECT test_authenticate_as('a1111111-1111-4111-a111-111111111111'::uuid);

-- 1. Client A can see their own invoice
SELECT ok(
  (SELECT count(*) FROM finance.invoices WHERE id = 'f1a11111-1111-4111-a111-111111111111'::uuid) = 1,
  'Client A can see their own invoice'
);

-- 2. Client A CANNOT see Client B's invoice even with the exact UUID (the IDOR case)
SELECT ok(
  (SELECT count(*) FROM finance.invoices WHERE id = 'f2a22222-2222-4222-a222-222222222222'::uuid) = 0,
  'Client A cannot see Client B invoice by id (cross-workspace IDOR blocked)'
);

-- 3. Client A can see their own event
SELECT ok(
  (SELECT count(*) FROM ops.events WHERE id = 'd1111111-1111-4111-a111-111111111111'::uuid) = 1,
  'Client A can see their own event'
);

-- 4. Client A CANNOT see Client B's event
SELECT ok(
  (SELECT count(*) FROM ops.events WHERE id = 'd2222222-2222-4222-a222-222222222222'::uuid) = 0,
  'Client A cannot see Client B event by id'
);

-- 5. Client A can see their own project
SELECT ok(
  (SELECT count(*) FROM ops.projects WHERE id = 'd1a11111-1111-4111-a111-111111111111'::uuid) = 1,
  'Client A can see their own project'
);

-- 6. Client A CANNOT see Client B's project
SELECT ok(
  (SELECT count(*) FROM ops.projects WHERE id = 'd2a22222-2222-4222-a222-222222222222'::uuid) = 0,
  'Client A cannot see Client B project by id'
);

-- 7. Client A can see their own proposal (via the deals→events join)
SELECT ok(
  (SELECT count(*) FROM public.proposals WHERE id = 'f1111111-1111-4111-a111-111111111111'::uuid) = 1,
  'Client A can see their own proposal'
);

-- 8. Client A CANNOT see Client B's proposal — this catches the case where
--    the policy's deals→events→client_entity_id chain is broken.
SELECT ok(
  (SELECT count(*) FROM public.proposals WHERE id = 'f2222222-2222-4222-a222-222222222222'::uuid) = 0,
  'Client A cannot see Client B proposal by id (join chain isolates correctly)'
);

SELECT test_reset_role();

-- ── Tests — Client B perspective (bidirectional symmetry) ───────────────

SELECT test_authenticate_as('a2222222-2222-4222-a222-222222222222'::uuid);

-- 9. Client B cannot see any of A's invoices via a broad select
SELECT ok(
  (SELECT count(*) FROM finance.invoices WHERE workspace_id = 'b1111111-1111-4111-a111-111111111111'::uuid) = 0,
  'Client B cannot list any invoices from workspace A'
);

-- 10. Same for events
SELECT ok(
  (SELECT count(*) FROM ops.events WHERE workspace_id = 'b1111111-1111-4111-a111-111111111111'::uuid) = 0,
  'Client B cannot list any events from workspace A'
);

-- 11. Same for projects
SELECT ok(
  (SELECT count(*) FROM ops.projects WHERE workspace_id = 'b1111111-1111-4111-a111-111111111111'::uuid) = 0,
  'Client B cannot list any projects from workspace A'
);

-- 12. Same for proposals
SELECT ok(
  (SELECT count(*) FROM public.proposals WHERE workspace_id = 'b1111111-1111-4111-a111-111111111111'::uuid) = 0,
  'Client B cannot list any proposals from workspace A'
);

SELECT test_reset_role();

SELECT * FROM finish();
ROLLBACK;
