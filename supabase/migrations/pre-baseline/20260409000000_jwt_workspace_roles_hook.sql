-- =============================================================================
-- JWT Workspace Roles: Sync Trigger + Backfill
-- =============================================================================
-- Keeps raw_app_meta_data.workspace_roles in sync with workspace_members.
-- Supabase includes app_metadata in JWT claims automatically, so middleware
-- can read roles without DB calls.
--
-- Format: { "workspace_roles": { "ws-uuid": "role_slug", ... } }
--
-- NOTE: The custom_access_token Auth Hook (auth.custom_access_token_hook)
-- must be created via the Supabase Dashboard since the auth schema is
-- restricted. The trigger below handles the write path; the hook handles
-- the read path on token issuance.
-- =============================================================================

-- 1. Sync trigger: fires on workspace_members INSERT/UPDATE/DELETE
-- Rebuilds the full workspace_roles map for the affected user.

CREATE OR REPLACE FUNCTION public.sync_workspace_roles_to_app_metadata()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops, auth
AS $$
DECLARE
  v_user_id uuid;
  v_roles jsonb;
BEGIN
  v_user_id := COALESCE(NEW.user_id, OLD.user_id);

  SELECT COALESCE(jsonb_object_agg(
    wm.workspace_id::text,
    COALESCE(wr.slug, LOWER(TRIM(wm.role)))
  ), '{}'::jsonb)
  INTO v_roles
  FROM public.workspace_members wm
  LEFT JOIN ops.workspace_roles wr ON wr.id = wm.role_id
  WHERE wm.user_id = v_user_id;

  UPDATE auth.users
  SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
    jsonb_build_object('workspace_roles', v_roles)
  WHERE id = v_user_id;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_workspace_roles ON public.workspace_members;
CREATE TRIGGER trg_sync_workspace_roles
  AFTER INSERT OR UPDATE OF role_id, role OR DELETE
  ON public.workspace_members
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_workspace_roles_to_app_metadata();

-- 2. Backfill existing users

DO $$
DECLARE
  rec record;
BEGIN
  FOR rec IN
    SELECT DISTINCT user_id FROM public.workspace_members
  LOOP
    UPDATE auth.users
    SET raw_app_meta_data = COALESCE(raw_app_meta_data, '{}'::jsonb) ||
      jsonb_build_object('workspace_roles', (
        SELECT COALESCE(jsonb_object_agg(
          wm.workspace_id::text,
          COALESCE(wr.slug, LOWER(TRIM(wm.role)))
        ), '{}'::jsonb)
        FROM public.workspace_members wm
        LEFT JOIN ops.workspace_roles wr ON wr.id = wm.role_id
        WHERE wm.user_id = rec.user_id
      ))
    WHERE id = rec.user_id;
  END LOOP;
END;
$$;
