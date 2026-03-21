-- Remove all crew from the "Pure Lavish" organization so you can re-test adding.
-- Run this in Supabase Dashboard → SQL Editor.
--
-- 1) Run scripts/debug/list-pure-lavish-org-and-crew.sql first to see org id and crew counts.
-- 2) If the name below doesn’t match your org, set pure_lavish_id manually at the bottom.
-- 3) After running, hard-refresh the app and re-open the Pure Lavish card so the UI clears cached crew.

DO $$
DECLARE
  pure_lavish_id uuid;
  deleted_members int;
  deleted_affs int;
BEGIN
  SELECT id INTO pure_lavish_id
  FROM public.organizations
  WHERE name ILIKE '%Pure Lavish%'
  LIMIT 1;

  IF pure_lavish_id IS NULL THEN
    RAISE NOTICE 'No organization named "Pure Lavish" found. Run list-pure-lavish-org-and-crew.sql, copy the org_id, then run the DELETE BY ID block below.';
    RETURN;
  END IF;

  DELETE FROM public.org_members WHERE org_id = pure_lavish_id;
  GET DIAGNOSTICS deleted_members = ROW_COUNT;

  DELETE FROM public.affiliations WHERE organization_id = pure_lavish_id;
  GET DIAGNOSTICS deleted_affs = ROW_COUNT;

  RAISE NOTICE 'Org id % – deleted % org_members, % affiliations. Hard-refresh the app and re-open the card.', pure_lavish_id, deleted_members, deleted_affs;
END $$;

-- If the name search found nothing, run list-pure-lavish-org-and-crew.sql, then run this with the org_id from the result:
-- DELETE FROM public.org_members WHERE org_id = 'PASTE_ORG_ID_HERE';
-- DELETE FROM public.affiliations WHERE organization_id = 'PASTE_ORG_ID_HERE';
