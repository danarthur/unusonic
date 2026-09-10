-- Remove workspaces that a failed onboarding could not roll back.
--
-- `complete-setup.ts` creates the workspace, then the org entity, then the
-- person. If a later step fails it rolls back:
--
--   await dirDb.from('entities').delete()...
--   await db.from('workspaces').delete()...
--
-- The entity delete worked. The workspace delete never has: `public.workspaces`
-- carries RLS policies for INSERT and SELECT and none for DELETE, so the
-- statement matched zero rows and PostgREST reported no error. The same missing
-- policy that stopped the vocabulary setting from ever saving also stopped
-- every failed onboarding from cleaning up after itself.
--
-- Production held one, from 2026-03-22, with the collision slug
-- "invisible-touch-events-g631rm" -- the suffix is only appended when the name
-- is already taken, so it was a second attempt at a workspace that already
-- existed. No members, no entities, no deals. It had since been seeded with a
-- default Sales pipeline by an April backfill, because every "for each
-- workspace" migration counted it as real.
--
-- Deleted by predicate rather than by id: an id would be meaningless on any
-- other database, and the predicate is what actually describes the defect.

-- A workspace nobody belongs to is not reachable, so this cannot remove access
-- from anyone. The assertion is that the delete changed nothing about the
-- workspaces that do have members -- counted before and after, rather than
-- asserting that at least one survives. A fresh database has none to begin
-- with, and "there were never any" is not the same failure as "they are gone".
DO $$
DECLARE
  v_before bigint;
  v_after  bigint;
BEGIN
  SELECT count(*) INTO v_before
  FROM public.workspaces w
  WHERE EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = w.id);

  DELETE FROM public.workspaces w
  WHERE NOT EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM directory.entities e WHERE e.owner_workspace_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM public.deals d WHERE d.workspace_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM public.contracts c WHERE c.workspace_id = w.id)
    AND NOT EXISTS (SELECT 1 FROM ops.projects p WHERE p.workspace_id = w.id)
    AND w.stripe_customer_id IS NULL
    -- An onboarding in flight has none of the above either. A day is far longer
    -- than the flow takes and far shorter than anyone would leave a real
    -- workspace empty.
    AND w.created_at < now() - interval '1 day';

  SELECT count(*) INTO v_after
  FROM public.workspaces w
  WHERE EXISTS (SELECT 1 FROM public.workspace_members m WHERE m.workspace_id = w.id);

  IF v_after <> v_before THEN
    RAISE EXCEPTION
      'removed % workspace(s) that had members -- refusing', v_before - v_after;
  END IF;
END $$;
