-- Delete all internal employees from the roster (cortex.relationships ROSTER_MEMBER edges).
-- Use case: clear test data so you can re-add people and test the role selector.
-- Run in Supabase Dashboard → SQL Editor (runs with sufficient privileges to delete from cortex).
--
-- Internal employees = ROSTER_MEMBER edges where employment_status is NULL or 'internal_employee'.
-- After running, hard-refresh the app; re-add Daniel Arthur (and others) via Network / Team invite to test roles.

-- 1) Preview: list ROSTER_MEMBER edges that will be deleted (person → org, employment_status)
SELECT
  r.id AS relationship_id,
  r.source_entity_id AS person_entity_id,
  r.target_entity_id AS org_entity_id,
  r.context_data->>'employment_status' AS employment_status,
  r.context_data->>'role' AS role,
  p.display_name AS person_display_name,
  o.legacy_org_id AS org_legacy_id
FROM cortex.relationships r
JOIN directory.entities p ON p.id = r.source_entity_id
JOIN directory.entities o ON o.id = r.target_entity_id
WHERE r.relationship_type = 'ROSTER_MEMBER'
  AND (r.context_data->>'employment_status' IS NULL OR r.context_data->>'employment_status' = 'internal_employee');

-- 2) Delete those ROSTER_MEMBER edges (internal employees only; leaves external_contractor if any)
DELETE FROM cortex.relationships
WHERE relationship_type = 'ROSTER_MEMBER'
  AND (context_data->>'employment_status' IS NULL OR context_data->>'employment_status' = 'internal_employee');

-- Optional: show how many were deleted (run right after the DELETE in the same session)
-- SELECT COUNT(*) FROM cortex.relationships WHERE relationship_type = 'ROSTER_MEMBER';
