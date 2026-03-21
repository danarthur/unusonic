-- =============================================================================
-- DIAGNOSTIC: Who is actually in cortex.relationships as ROSTER_MEMBER?
-- Run in Supabase SQL Editor — READ ONLY.
-- =============================================================================

-- 1. Find your org entity (replace with your legacy org UUID if needed)
--    This shows all directory.entities of type 'company' so you can find yours.
SELECT id, display_name, legacy_org_id, owner_workspace_id
FROM directory.entities
WHERE type IN ('company', 'venue')
ORDER BY created_at DESC;

-- 2. All ROSTER_MEMBER edges in cortex.relationships, with person details.
--    Replace <ORG_ENTITY_ID> with the id from query 1 above.
SELECT
  r.id                                      AS edge_id,
  r.relationship_type,
  r.source_entity_id                        AS person_entity_id,
  e.display_name,
  e.owner_workspace_id                      AS person_workspace,
  e.claimed_by_user_id,
  e.attributes->>'email'                    AS email,
  e.attributes->>'is_ghost'                 AS is_ghost,
  r.context_data->>'first_name'             AS first_name,
  r.context_data->>'last_name'              AS last_name,
  r.context_data->>'role'                   AS role,
  r.context_data->>'employment_status'      AS employment_status,
  r.context_data->>'job_title'              AS job_title,
  r.created_at                              AS edge_created_at
FROM cortex.relationships r
LEFT JOIN directory.entities e ON e.id = r.source_entity_id
WHERE r.relationship_type = 'ROSTER_MEMBER'
ORDER BY r.created_at DESC;

-- 3. Check if Daniel Arthur specifically exists as a person entity
SELECT
  id,
  display_name,
  claimed_by_user_id,
  owner_workspace_id,
  attributes->>'email'    AS email,
  attributes->>'is_ghost' AS is_ghost,
  created_at
FROM directory.entities
WHERE type = 'person'
  AND (
    display_name ILIKE '%daniel%arthur%'
    OR attributes->>'email' ILIKE '%daniel%'
    OR attributes->>'first_name' ILIKE '%daniel%'
  )
ORDER BY created_at DESC;
