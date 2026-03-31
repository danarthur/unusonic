-- =============================================================================
-- Move workspace IAM tables from public → ops schema.
--
-- Tables: workspace_roles, workspace_permissions, workspace_role_permissions
--
-- Steps:
--   1. Create ops tables (same DDL, no permission_bundle — already dropped)
--   2. Copy all data (UUIDs preserved)
--   3. Update workspace_members.role_id FK → ops.workspace_roles
--   4. RLS on new ops tables (using get_my_workspace_ids() pattern)
--   5. Grants to authenticated
--   6. Update member_has_capability() to query ops schema
--   7. Drop public tables (junction → permissions → roles, FK order)
-- =============================================================================

-- =============================================================================
-- 1. Create ops.workspace_permissions (permission registry)
-- =============================================================================

CREATE TABLE ops.workspace_permissions (
  id   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key  text NOT NULL UNIQUE
);

COMMENT ON TABLE ops.workspace_permissions IS 'Registry of all valid capability keys. Read-only; managed by migrations.';

-- =============================================================================
-- 2. Create ops.workspace_roles
-- =============================================================================

CREATE TABLE ops.workspace_roles (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name         text NOT NULL,
  slug         text NOT NULL,
  is_system    boolean NOT NULL DEFAULT false,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE ops.workspace_roles IS 'Role definitions: system (workspace_id NULL) or custom (workspace_id set). Permissions in ops.workspace_role_permissions.';
COMMENT ON COLUMN ops.workspace_roles.workspace_id IS 'NULL for system roles (Owner, Admin, Member, Observer); set for custom workspace roles.';

-- Unique indexes matching the public schema constraints
CREATE UNIQUE INDEX ops_workspace_roles_system_slug_key
  ON ops.workspace_roles (slug) WHERE (workspace_id IS NULL);

CREATE UNIQUE INDEX ops_workspace_roles_custom_slug_workspace_key
  ON ops.workspace_roles (workspace_id, slug) WHERE (workspace_id IS NOT NULL);

CREATE INDEX ops_workspace_roles_workspace_id_idx
  ON ops.workspace_roles (workspace_id) WHERE (workspace_id IS NOT NULL);

-- =============================================================================
-- 3. Create ops.workspace_role_permissions (junction)
-- =============================================================================

CREATE TABLE ops.workspace_role_permissions (
  role_id       uuid NOT NULL REFERENCES ops.workspace_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES ops.workspace_permissions(id) ON DELETE RESTRICT,
  PRIMARY KEY (role_id, permission_id)
);

COMMENT ON TABLE ops.workspace_role_permissions IS 'Which permissions each role has. Normalized junction; no JSONB.';

CREATE INDEX ops_workspace_role_permissions_role_id_idx
  ON ops.workspace_role_permissions (role_id);

CREATE INDEX ops_workspace_role_permissions_permission_id_idx
  ON ops.workspace_role_permissions (permission_id);

-- =============================================================================
-- 4. Copy data (preserve UUIDs)
-- =============================================================================

INSERT INTO ops.workspace_permissions (id, key)
SELECT id, key FROM public.workspace_permissions;

INSERT INTO ops.workspace_roles (id, name, slug, is_system, workspace_id, created_at, updated_at)
SELECT id, name, slug, is_system, workspace_id, created_at, updated_at
FROM public.workspace_roles;

INSERT INTO ops.workspace_role_permissions (role_id, permission_id)
SELECT role_id, permission_id FROM public.workspace_role_permissions;

-- =============================================================================
-- 5. Update workspace_members.role_id FK → ops.workspace_roles
-- =============================================================================

ALTER TABLE public.workspace_members
  DROP CONSTRAINT IF EXISTS workspace_members_role_id_fkey;

ALTER TABLE public.workspace_members
  ADD CONSTRAINT workspace_members_role_id_fkey
  FOREIGN KEY (role_id) REFERENCES ops.workspace_roles(id) ON DELETE RESTRICT;

-- =============================================================================
-- 6. RLS on ops tables
-- =============================================================================

-- --- ops.workspace_roles ---

ALTER TABLE ops.workspace_roles ENABLE ROW LEVEL SECURITY;

-- System roles are visible to all authenticated; custom roles visible to workspace members
CREATE POLICY workspace_roles_select ON ops.workspace_roles
  FOR SELECT USING (
    workspace_id IS NULL
    OR workspace_id IN (SELECT get_my_workspace_ids())
  );

CREATE POLICY workspace_roles_insert ON ops.workspace_roles
  FOR INSERT WITH CHECK (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY workspace_roles_update ON ops.workspace_roles
  FOR UPDATE USING (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY workspace_roles_delete ON ops.workspace_roles
  FOR DELETE USING (
    workspace_id IS NOT NULL
    AND is_system = false
    AND workspace_id IN (SELECT get_my_workspace_ids())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

-- --- ops.workspace_permissions ---

ALTER TABLE ops.workspace_permissions ENABLE ROW LEVEL SECURITY;

-- Registry is read-only for all authenticated users
CREATE POLICY workspace_permissions_select ON ops.workspace_permissions
  FOR SELECT TO authenticated USING (true);

-- --- ops.workspace_role_permissions ---

ALTER TABLE ops.workspace_role_permissions ENABLE ROW LEVEL SECURITY;

-- Visible where user can see the role
CREATE POLICY workspace_role_permissions_select ON ops.workspace_role_permissions
  FOR SELECT USING (
    role_id IN (
      SELECT id FROM ops.workspace_roles
      WHERE workspace_id IS NULL
         OR workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

-- Only owner/admin can add permissions to custom roles
CREATE POLICY workspace_role_permissions_insert ON ops.workspace_role_permissions
  FOR INSERT WITH CHECK (
    role_id IN (
      SELECT id FROM ops.workspace_roles
      WHERE workspace_id IS NOT NULL
        AND workspace_id IN (SELECT get_my_workspace_ids())
        AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    )
  );

-- Only owner/admin can remove permissions from custom roles
CREATE POLICY workspace_role_permissions_delete ON ops.workspace_role_permissions
  FOR DELETE USING (
    role_id IN (
      SELECT id FROM ops.workspace_roles
      WHERE workspace_id IS NOT NULL
        AND workspace_id IN (SELECT get_my_workspace_ids())
        AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    )
  );

-- =============================================================================
-- 7. Grants to authenticated
-- =============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.workspace_roles TO authenticated;
GRANT SELECT ON ops.workspace_permissions TO authenticated;
GRANT SELECT, INSERT, DELETE ON ops.workspace_role_permissions TO authenticated;

-- =============================================================================
-- 8. Update member_has_capability() to query ops schema
-- =============================================================================

CREATE OR REPLACE FUNCTION public.member_has_capability(
  p_workspace_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_role_id uuid;
  v_legacy_role text;
BEGIN
  SELECT wm.role_id, wm.role
  INTO v_role_id, v_legacy_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = auth.uid()
  LIMIT 1;

  IF v_role_id IS NULL AND v_legacy_role IS NULL THEN
    RETURN false;
  END IF;

  -- Fallback: resolve system role by legacy text slug
  IF v_role_id IS NULL AND v_legacy_role IS NOT NULL THEN
    SELECT id INTO v_role_id
    FROM ops.workspace_roles
    WHERE workspace_id IS NULL
      AND slug = LOWER(TRIM(v_legacy_role))
    LIMIT 1;
  END IF;

  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;

  -- Check wildcard (workspace:owner) or exact permission via normalized junction
  RETURN EXISTS (
    SELECT 1
    FROM ops.workspace_role_permissions wrp
    JOIN ops.workspace_permissions wp ON wp.id = wrp.permission_id
    WHERE wrp.role_id = v_role_id
      AND (wp.key = 'workspace:owner' OR wp.key = p_permission_key)
    LIMIT 1
  );
END;
$$;

COMMENT ON FUNCTION public.member_has_capability(uuid, text) IS 'Returns true if current user has the capability in the workspace. Uses ops.workspace_role_permissions (normalized). Use (SELECT member_has_capability(...)) in RLS for initPlan caching.';

-- =============================================================================
-- 9. Drop public tables (FK order: junction → permissions → roles)
-- =============================================================================

DROP TABLE public.workspace_role_permissions;
DROP TABLE public.workspace_permissions;
DROP TABLE public.workspace_roles;
