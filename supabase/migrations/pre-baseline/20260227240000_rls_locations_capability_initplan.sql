-- RLS: Use capability check with initPlan-friendly subquery for locations.
-- See docs/design/capabilities-roles-normalized-and-rls.md §3.
-- Run after 20260227230000_normalize_workspace_role_permissions.sql.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = 'locations') THEN
    RETURN;
  END IF;

  -- Drop legacy role-based policies on locations (if they exist)
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locations' AND policyname = 'Admins can create locations') THEN
    DROP POLICY "Admins can create locations" ON public.locations;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locations' AND policyname = 'Admins can delete locations') THEN
    DROP POLICY "Admins can delete locations" ON public.locations;
  END IF;
  IF EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locations' AND policyname = 'Admins can update locations') THEN
    DROP POLICY "Admins can update locations" ON public.locations;
  END IF;

  -- Single capability-based policy with (SELECT ...) for initPlan caching
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = 'locations' AND policyname = 'Locations capability check') THEN
    CREATE POLICY "Locations capability check"
      ON public.locations
      FOR ALL
      USING ((SELECT member_has_capability(workspace_id, 'locations:manage')))
      WITH CHECK ((SELECT member_has_capability(workspace_id, 'locations:manage')));
  END IF;
END$$;
