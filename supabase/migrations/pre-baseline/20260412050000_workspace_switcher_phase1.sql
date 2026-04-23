-- =============================================================================
-- Workspace Switcher Phase 1
-- =============================================================================
-- Enables multi-workspace identity: one user, many workspaces, per-workspace
-- roles (owner/admin/member/employee/client). A DJ company owner can also
-- appear as a client on another company's workspace.
--
-- Changes:
--   1. Expand workspace_members role CHECK to allow 'employee' and 'client'
--   2. Seed 'client' system role in ops.workspace_roles
--   3. Modify get_my_workspace_ids() to exclude client-role memberships
--      (clients access data via get_my_client_entity_ids() policies only)
--   4. Create claim_ghost_entities_for_user() RPC
-- =============================================================================


-- ---------------------------------------------------------------------------
-- 1. Expand workspace_members role CHECK constraint
-- ---------------------------------------------------------------------------
-- The legacy CHECK only allowed ('owner', 'admin', 'member'). The employee
-- portal and now the client portal need their own role values.

ALTER TABLE public.workspace_members
  DROP CONSTRAINT workspace_members_role_check;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_check
  CHECK (role = ANY (ARRAY['owner', 'admin', 'member', 'employee', 'client']));


-- ---------------------------------------------------------------------------
-- 2. Seed 'client' system role
-- ---------------------------------------------------------------------------

INSERT INTO ops.workspace_roles (name, slug, is_system)
VALUES ('Client', 'client', true)
ON CONFLICT (slug) WHERE workspace_id IS NULL
DO NOTHING;


-- ---------------------------------------------------------------------------
-- 3. Modify get_my_workspace_ids() to exclude client-role memberships
-- ---------------------------------------------------------------------------
-- Client workspace members must NOT pass workspace-scoped RLS policies.
-- Their data access is governed by the client-entity-scoped policies
-- (get_my_client_entity_ids) added in the client portal foundation migration.
-- Without this exclusion, a client member could see ALL workspace invoices,
-- events, and proposals -- not just their own.
--
-- Performance: the role != 'client' filter is on the text column with no
-- join, so no measurable overhead vs the original function.

CREATE OR REPLACE FUNCTION public.get_my_workspace_ids()
  RETURNS SETOF uuid
  LANGUAGE plpgsql
  STABLE SECURITY DEFINER
  SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT workspace_id
  FROM public.workspace_members
  WHERE user_id = auth.uid()
    AND role != 'client';
END;
$$;

COMMENT ON FUNCTION public.get_my_workspace_ids() IS
  'Returns workspace IDs for the calling user, excluding client-role memberships. '
  'Client access is handled by get_my_client_entity_ids() policies instead.';


-- ---------------------------------------------------------------------------
-- 4. claim_ghost_entities_for_user() RPC
-- ---------------------------------------------------------------------------
-- Called during onboarding after passkey registration. Finds all ghost entities
-- whose email matches the authenticated user's email AND that have a CLIENT
-- edge in cortex.relationships, claims them, and creates workspace memberships.
--
-- Security:
--   - SECURITY DEFINER to cross schema boundaries (directory, cortex, ops)
--   - Uses auth.uid() internally — no user ID parameter to prevent spoofing
--   - REVOKE from PUBLIC and anon (per sev-zero grant posture)
--   - Only claims entities that are targets of CLIENT edges (not all email matches)
--   - Re-checks claimed_by_user_id IS NULL on UPDATE to prevent race conditions

CREATE OR REPLACE FUNCTION public.claim_ghost_entities_for_user()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = ''
AS $$
DECLARE
  v_user_id    uuid;
  v_email      text;
  client_role_id uuid;
  claimed_count  integer := 0;
  ghost_row      record;
BEGIN
  -- 1. Derive identity from auth context
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not authenticated';
  END IF;

  SELECT email INTO v_email
  FROM auth.users
  WHERE id = v_user_id;

  IF v_email IS NULL THEN
    RETURN 0;
  END IF;

  -- 2. Resolve client system role
  SELECT id INTO client_role_id
  FROM ops.workspace_roles
  WHERE slug = 'client'
    AND is_system = true
    AND workspace_id IS NULL
  LIMIT 1;

  IF client_role_id IS NULL THEN
    RAISE EXCEPTION 'client system role not found';
  END IF;

  -- 3. Find and claim ghost entities that are CLIENT edge targets
  --    Convention: source = vendor root entity, target = client entity
  --    (per client_is_workspace_client and foundation migration)
  FOR ghost_row IN
    SELECT DISTINCT e.id AS entity_id, e.owner_workspace_id
    FROM directory.entities e
    INNER JOIN cortex.relationships r
      ON r.target_entity_id = e.id
      AND r.relationship_type = 'CLIENT'
      AND r.context_data->>'deleted_at' IS NULL
    WHERE lower(e.attributes->>'email') = lower(v_email)
      AND e.claimed_by_user_id IS NULL
      AND e.owner_workspace_id IS NOT NULL
  LOOP
    -- Claim the entity (re-check NULL guard for concurrent callers)
    UPDATE directory.entities
    SET claimed_by_user_id = v_user_id
    WHERE id = ghost_row.entity_id
      AND claimed_by_user_id IS NULL;

    IF FOUND THEN
      -- Create workspace membership (PK dedup: workspace_id, user_id)
      INSERT INTO public.workspace_members (workspace_id, user_id, role, role_id)
      VALUES (ghost_row.owner_workspace_id, v_user_id, 'client', client_role_id)
      ON CONFLICT (workspace_id, user_id) DO NOTHING;

      claimed_count := claimed_count + 1;
    END IF;
  END LOOP;

  RETURN claimed_count;
END;
$$;

COMMENT ON FUNCTION public.claim_ghost_entities_for_user() IS
  'Claims ghost entities matching the authenticated user''s email that have CLIENT '
  'relationship edges. Creates workspace memberships with client role. Called during '
  'onboarding after passkey registration.';

-- Grant to authenticated only — revoke from PUBLIC and anon per grant posture
REVOKE EXECUTE ON FUNCTION public.claim_ghost_entities_for_user() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_ghost_entities_for_user() FROM anon;
GRANT EXECUTE ON FUNCTION public.claim_ghost_entities_for_user() TO authenticated;
