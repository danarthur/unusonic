-- Section 1: Capabilities-based roles. See docs/design/capabilities-based-roles-and-role-builder.md
-- and docs/design/section-1-supabase-rules-compliance.md.
-- Adds public.workspace_roles, workspace_members.role_id (ON DELETE RESTRICT), backfill, RLS, and member_has_capability.

-- =============================================================================
-- 1. Create workspace_roles (exception: public schema, workspace identity layer)
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.workspace_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL,
  is_system boolean NOT NULL DEFAULT false,
  workspace_id uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  permission_bundle jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.workspace_roles IS 'Role definitions: system (global) or custom (per-workspace). permission_bundle is array of capability keys.';
COMMENT ON COLUMN public.workspace_roles.workspace_id IS 'NULL for system roles (Owner, Admin, Member, Observer); set for custom roles.';
COMMENT ON COLUMN public.workspace_roles.permission_bundle IS 'JSON array of permission keys, e.g. ["finance:view","deals:read:global"]. Use "workspace:owner" for wildcard.';

-- System roles: one row per slug when workspace_id IS NULL. Custom: unique (workspace_id, slug).
CREATE UNIQUE INDEX workspace_roles_system_slug_key
  ON public.workspace_roles (slug) WHERE (workspace_id IS NULL);

CREATE UNIQUE INDEX workspace_roles_custom_slug_workspace_key
  ON public.workspace_roles (workspace_id, slug) WHERE (workspace_id IS NOT NULL);

CREATE INDEX workspace_roles_workspace_id_idx ON public.workspace_roles (workspace_id) WHERE (workspace_id IS NOT NULL);

-- =============================================================================
-- 2. Insert system roles (immutable bundles; see permission-registry.ts)
-- Idempotent: insert only when system role for that slug does not exist.
-- =============================================================================

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.workspace_roles WHERE slug = 'owner' AND workspace_id IS NULL) THEN
    INSERT INTO public.workspace_roles (name, slug, is_system, workspace_id, permission_bundle)
    VALUES ('Owner', 'owner', true, NULL, '["workspace:owner"]'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_roles WHERE slug = 'admin' AND workspace_id IS NULL) THEN
    INSERT INTO public.workspace_roles (name, slug, is_system, workspace_id, permission_bundle)
    VALUES ('Admin', 'admin', true, NULL, '["finance:view","planning:view","ros:view","workspace:team:manage","locations:manage","deals:read:global","deals:edit:global","proposals:view","proposals:send","proposals:approve","workspace:roles:manage","finance:invoices:create","finance:invoices:edit"]'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_roles WHERE slug = 'member' AND workspace_id IS NULL) THEN
    INSERT INTO public.workspace_roles (name, slug, is_system, workspace_id, permission_bundle)
    VALUES ('Member', 'member', true, NULL, '["finance:view","planning:view","ros:view","workspace:team:manage","locations:manage","deals:read:global","deals:edit:global","proposals:view","proposals:send"]'::jsonb);
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.workspace_roles WHERE slug = 'observer' AND workspace_id IS NULL) THEN
    INSERT INTO public.workspace_roles (name, slug, is_system, workspace_id, permission_bundle)
    VALUES ('Observer', 'observer', true, NULL, '["finance:view","planning:view","ros:view","deals:read:global","proposals:view"]'::jsonb);
  END IF;
END$$;

-- =============================================================================
-- 3. Add role_id to workspace_members (ON DELETE RESTRICT: cannot delete role in use)
-- =============================================================================

ALTER TABLE public.workspace_members
  ADD COLUMN IF NOT EXISTS role_id uuid REFERENCES public.workspace_roles(id) ON DELETE RESTRICT;

COMMENT ON COLUMN public.workspace_members.role_id IS 'Resolved role; legacy role (text) kept for backward compatibility until unpacker is default.';

-- =============================================================================
-- 4. Backfill role_id from legacy role text
-- =============================================================================

UPDATE public.workspace_members wm
SET role_id = r.id
FROM public.workspace_roles r
WHERE r.workspace_id IS NULL
  AND r.slug = LOWER(COALESCE(TRIM(wm.role), 'member'))
  AND wm.role_id IS NULL;

-- Normalize legacy role to match slug (owner, admin, member, observer)
UPDATE public.workspace_members wm
SET role_id = (SELECT id FROM public.workspace_roles WHERE workspace_id IS NULL AND slug = 'owner' LIMIT 1)
WHERE LOWER(TRIM(COALESCE(wm.role, ''))) IN ('owner') AND wm.role_id IS NULL;

UPDATE public.workspace_members wm
SET role_id = (SELECT id FROM public.workspace_roles WHERE workspace_id IS NULL AND slug = 'admin' LIMIT 1)
WHERE LOWER(TRIM(COALESCE(wm.role, ''))) IN ('admin') AND wm.role_id IS NULL;

UPDATE public.workspace_members wm
SET role_id = (SELECT id FROM public.workspace_roles WHERE workspace_id IS NULL AND slug = 'member' LIMIT 1)
WHERE LOWER(TRIM(COALESCE(wm.role, ''))) IN ('member') AND wm.role_id IS NULL;

-- Viewer (legacy) maps to observer
UPDATE public.workspace_members wm
SET role_id = (SELECT id FROM public.workspace_roles WHERE workspace_id IS NULL AND slug = 'observer' LIMIT 1)
WHERE LOWER(TRIM(COALESCE(wm.role, ''))) = 'viewer' AND wm.role_id IS NULL;

-- =============================================================================
-- 5. RLS on workspace_roles
-- =============================================================================

ALTER TABLE public.workspace_roles ENABLE ROW LEVEL SECURITY;

-- SELECT: system roles (workspace_id IS NULL) or roles in workspaces the user belongs to
CREATE POLICY workspace_roles_select
  ON public.workspace_roles FOR SELECT
  USING (
    workspace_id IS NULL
    OR workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- INSERT/UPDATE/DELETE: only custom roles in workspaces where user is owner or admin
CREATE POLICY workspace_roles_insert
  ON public.workspace_roles FOR INSERT
  WITH CHECK (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY workspace_roles_update
  ON public.workspace_roles FOR UPDATE
  USING (
    workspace_id IS NOT NULL
    AND workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

CREATE POLICY workspace_roles_delete
  ON public.workspace_roles FOR DELETE
  USING (
    workspace_id IS NOT NULL
    AND is_system = false
    AND workspace_id IN (SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid())
    AND public.user_has_workspace_role(workspace_id, ARRAY['owner', 'admin'])
  );

-- =============================================================================
-- 6. Unified capability check (SECURITY DEFINER)
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
  v_bundle jsonb;
  v_wildcard text := 'workspace:owner';
BEGIN
  -- Resolve membership and role
  SELECT wm.role_id, wm.role
  INTO v_role_id, v_legacy_role
  FROM public.workspace_members wm
  WHERE wm.workspace_id = p_workspace_id
    AND wm.user_id = auth.uid()
  LIMIT 1;

  IF v_role_id IS NULL AND v_legacy_role IS NULL THEN
    RETURN false; -- not a member
  END IF;

  -- If role_id not yet backfilled, resolve system role by legacy text
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

  SELECT permission_bundle INTO v_bundle
  FROM public.workspace_roles
  WHERE id = v_role_id
  LIMIT 1;

  IF v_bundle IS NULL THEN
    RETURN false;
  END IF;

  -- Wildcard (permission_bundle is a JSON array of strings)
  IF jsonb_typeof(v_bundle) = 'array' AND v_bundle @> to_jsonb(v_wildcard::text) THEN
    RETURN true;
  END IF;

  -- Exact key in array
  IF jsonb_typeof(v_bundle) = 'array' AND v_bundle @> to_jsonb(p_permission_key) THEN
    RETURN true;
  END IF;

  RETURN false;
END;
$$;

COMMENT ON FUNCTION public.member_has_capability(uuid, text) IS 'Returns true if current user has the given capability in the workspace (via role_id or legacy role). Use for RLS and app checks.';
