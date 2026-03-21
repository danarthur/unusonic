-- Run this FIRST in Supabase SQL Editor to see which org is "Pure Lavish" and how many crew rows it has.
-- Use the id in the DELETE script if the name doesn’t match.

SELECT
  o.id AS org_id,
  o.name AS org_name,
  (SELECT count(*) FROM public.org_members m WHERE m.org_id = o.id) AS org_members_count,
  (SELECT count(*) FROM public.affiliations a WHERE a.organization_id = o.id) AS affiliations_count
FROM public.organizations o
WHERE o.name ILIKE '%lavish%'
ORDER BY o.name;
