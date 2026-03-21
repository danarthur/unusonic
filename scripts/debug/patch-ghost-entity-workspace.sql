-- =============================================================================
-- PATCH: Set owner_workspace_id on ghost entities that are missing it.
-- This makes their ROSTER_MEMBER edges visible to the cortex RLS policy.
-- Run in Supabase SQL Editor.
-- =============================================================================

-- PREVIEW first: see what will be updated
SELECT
  e.id,
  e.display_name,
  e.attributes->>'email' AS email,
  r.context_data->>'first_name' AS first_name,
  r.context_data->>'last_name' AS last_name,
  org.display_name AS org_name,
  org.owner_workspace_id AS workspace_to_assign
FROM directory.entities e
JOIN cortex.relationships r ON r.source_entity_id = e.id AND r.relationship_type = 'ROSTER_MEMBER'
JOIN directory.entities org ON org.id = r.target_entity_id
WHERE e.claimed_by_user_id IS NULL
  AND e.owner_workspace_id IS NULL
  AND org.owner_workspace_id IS NOT NULL;

-- PATCH: assign owner_workspace_id from the org they're rostered to
UPDATE directory.entities e
SET owner_workspace_id = org.owner_workspace_id
FROM cortex.relationships r
JOIN directory.entities org ON org.id = r.target_entity_id
WHERE r.source_entity_id = e.id
  AND r.relationship_type = 'ROSTER_MEMBER'
  AND e.claimed_by_user_id IS NULL
  AND e.owner_workspace_id IS NULL
  AND org.owner_workspace_id IS NOT NULL;
