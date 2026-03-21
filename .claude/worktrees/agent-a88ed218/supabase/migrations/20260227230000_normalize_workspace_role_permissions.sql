-- Normalize permissions: replace permission_bundle JSONB with workspace_permissions + workspace_role_permissions.
-- Blueprint: junction table model for relational integrity and schema evolution.
-- See docs/design/capabilities-roles-normalized-and-rls.md.

-- =============================================================================
-- 1. Permission registry table (single source of truth for capability keys)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key text NOT NULL UNIQUE
);

COMMENT ON TABLE public.workspace_permissions IS 'Registry of all valid capability keys (domain:action or domain:action:scope). No orphaned keys in role_permissions.';

INSERT INTO public.workspace_permissions (key) VALUES
  ('workspace:owner'),
  ('workspace:delete'),
  ('workspace:transfer'),
  ('workspace:team:manage'),
  ('workspace:roles:manage'),
  ('locations:manage'),
  ('finance:view'),
  ('finance:invoices:create'),
  ('finance:invoices:edit'),
  ('planning:view'),
  ('ros:view'),
  ('ros:edit'),
  ('deals:read:global'),
  ('deals:edit:global'),
  ('proposals:view'),
  ('proposals:send'),
  ('proposals:approve')
ON CONFLICT (key) DO NOTHING;

-- =============================================================================
-- 2. Junction: role -> permissions
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_role_permissions (
  role_id uuid NOT NULL REFERENCES public.workspace_roles(id) ON DELETE CASCADE,
  permission_id uuid NOT NULL REFERENCES public.workspace_permissions(id) ON DELETE RESTRICT,
  PRIMARY KEY (role_id, permission_id)
);

COMMENT ON TABLE public.workspace_role_permissions IS 'Which permissions each role has. Normalized: no JSONB, referential integrity.';

CREATE INDEX IF NOT EXISTS workspace_role_permissions_role_id_idx
  ON public.workspace_role_permissions (role_id);

CREATE INDEX IF NOT EXISTS workspace_role_permissions_permission_id_idx
  ON public.workspace_role_permissions (permission_id);

-- =============================================================================
-- 3. Migrate permission_bundle -> junction rows
-- =============================================================================

INSERT INTO public.workspace_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM public.workspace_roles r
CROSS JOIN LATERAL jsonb_array_elements_text(r.permission_bundle) AS elem(key)
JOIN public.workspace_permissions p ON p.key = elem.key
WHERE r.permission_bundle IS NOT NULL
  AND jsonb_array_length(r.permission_bundle) > 0
ON CONFLICT (role_id, permission_id) DO NOTHING;

-- =============================================================================
-- 4. RLS on new tables
-- =============================================================================

ALTER TABLE public.workspace_permissions ENABLE ROW LEVEL SECURITY;

-- Permissions registry: read-only for all authenticated (same workspaces as roles)
CREATE POLICY workspace_permissions_select
  ON public.workspace_permissions FOR SELECT
  TO authenticated
  USING (true);

-- Junction: visible where user can see the role
ALTER TABLE public.workspace_role_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY workspace_role_permissions_select
  ON public.workspace_role_permissions FOR SELECT
  USING (
    role_id IN (
      SELECT id FROM public.workspace_roles
      WHERE workspace_id IS NULL
         OR workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    )
  );

-- Only owner/admin can modify role permissions (for custom roles)
CREATE POLICY workspace_role_permissions_insert
  ON public.workspace_role_permissions FOR INSERT
  WITH CHECK (
    role_id IN (
      SELECT id FROM public.workspace_roles
      WHERE workspace_id IS NOT NULL
        AND workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
        AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    )
  );

CREATE POLICY workspace_role_permissions_delete
  ON public.workspace_role_permissions FOR DELETE
  USING (
    role_id IN (
      SELECT id FROM public.workspace_roles
      WHERE workspace_id IS NOT NULL
        AND workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
        AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
    )
  );

-- =============================================================================
-- 5. Update member_has_capability to use junction (and initPlan-friendly pattern)
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

  IF v_role_id IS NULL AND v_legacy_role IS NOT NULL THEN
    SELECT id INTO v_role_id
    FROM public.workspace_roles
    WHERE workspace_id IS NULL
      AND slug = LOWER(TRIM(v_legacy_role))
    LIMIT 1;
  END IF;

  IF v_role_id IS NULL THEN
    RETURN false;
  END IF;

  -- Normalized check: role has workspace:owner (wildcard) or the exact permission
  RETURN EXISTS (
    SELECT 1
    FROM public.workspace_role_permissions wrp
    JOIN public.workspace_permissions wp ON wp.id = wrp.permission_id
    WHERE wrp.role_id = v_role_id
      AND (wp.key = 'workspace:owner' OR wp.key = p_permission_key)
    LIMIT 1
  );
END;
$$;

COMMENT ON FUNCTION public.member_has_capability(uuid, text) IS 'Returns true if current user has the capability in the workspace. Uses normalized role_permissions. Use (SELECT member_has_capability(...)) in RLS for initPlan caching.';

-- =============================================================================
-- 6. Drop permission_bundle from workspace_roles
-- =============================================================================

ALTER TABLE public.workspace_roles DROP COLUMN IF EXISTS permission_bundle;

COMMENT ON TABLE public.workspace_roles IS 'Role definitions: system (workspace_id NULL) or custom (workspace_id set). Permissions live in workspace_role_permissions.';
