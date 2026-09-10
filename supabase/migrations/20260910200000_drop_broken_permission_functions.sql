-- `member_has_permission` and `get_member_permissions` raise on every call.
--
-- Both read `public.workspace_members.permissions`, a column dropped when
-- capabilities moved to `ops.workspace_roles`. Both are SECURITY DEFINER and
-- both were executable by `anon`. Neither is referenced by any RLS policy or
-- any other function, and their app callers went when `hasPermission` did.
--
-- `member_has_capability` is the live replacement and stays.

DROP FUNCTION IF EXISTS public.member_has_permission(uuid, text);
DROP FUNCTION IF EXISTS public.get_member_permissions(uuid, uuid);

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
             WHERE n.nspname='public'
               AND p.proname IN ('member_has_permission','get_member_permissions')) THEN
    RAISE EXCEPTION 'broken permission functions still present';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
                 WHERE n.nspname='public' AND p.proname='member_has_capability') THEN
    RAISE EXCEPTION 'member_has_capability is missing -- it is the live replacement';
  END IF;
END $$;
