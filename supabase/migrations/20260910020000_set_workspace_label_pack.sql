-- Let a workspace actually change its own vocabulary.
--
-- `setWorkspaceLabelPack` has never worked. `public.workspaces` carries RLS
-- policies for INSERT and SELECT and none for UPDATE, so the authenticated
-- client's update matched zero rows -- and PostgREST does not treat a zero-row
-- update as an error. The action saw no error, returned ok, and the picker
-- reported success while nothing was written.
--
-- Deliberately an RPC rather than an UPDATE policy on the table. A policy broad
-- enough to permit this column would also permit `stripe_customer_id`,
-- `subscription_status` and every other column on the row -- the same reasoning
-- that keeps cortex.relationships SELECT-only with writes behind SECURITY
-- DEFINER functions. One column, one function, one check.
--
-- Owners and admins only. Vocabulary is workspace-wide: it changes what every
-- member sees a section called, which is not a per-user preference.

CREATE OR REPLACE FUNCTION public.set_workspace_label_pack(
  p_workspace_id uuid,
  p_pack text
) RETURNS jsonb
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO ''
  AS $$
DECLARE
  v_user_id uuid;
  v_rows int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'set_workspace_label_pack: not authenticated' USING ERRCODE = '42501';
  END IF;

  -- The set is closed on purpose. Free-text renaming makes help docs,
  -- screenshots and Aion's synonym map unbounded.
  IF p_pack NOT IN ('roster', 'crew', 'talent') THEN
    RAISE EXCEPTION 'set_workspace_label_pack: unknown pack %', p_pack
      USING ERRCODE = '22023';
  END IF;

  IF NOT public.user_has_workspace_role(p_workspace_id, ARRAY['owner', 'admin']) THEN
    RAISE EXCEPTION 'set_workspace_label_pack: requires owner or admin'
      USING ERRCODE = '42501';
  END IF;

  UPDATE public.workspaces
  SET network_label_pack = p_pack
  WHERE id = p_workspace_id;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  IF v_rows = 0 THEN
    RETURN jsonb_build_object('ok', false, 'error', 'Workspace not found.');
  END IF;

  RETURN jsonb_build_object('ok', true, 'pack', p_pack);
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, and CREATE OR REPLACE
-- inherits production's ACL while leaving a fresh database at proacl = NULL.
REVOKE ALL ON FUNCTION public.set_workspace_label_pack(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.set_workspace_label_pack(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.set_workspace_label_pack(uuid, text)
  TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'public.set_workspace_label_pack(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'set_workspace_label_pack is executable by anon';
  END IF;
END $$;

COMMENT ON FUNCTION public.set_workspace_label_pack(uuid, text) IS
  'Change a workspace''s network vocabulary pack. Owners and admins only. One column, because a broad UPDATE policy on workspaces would also expose the billing columns.';
