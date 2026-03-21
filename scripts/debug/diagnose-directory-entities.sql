-- =============================================================================
-- DIAGNOSTIC: directory.entities breakdown
-- Run in Supabase SQL Editor — READ ONLY, no changes made.
-- Review each section before deciding what to delete.
-- =============================================================================

-- 1. Overall counts by type
SELECT
  type,
  COUNT(*) AS total,
  COUNT(*) FILTER (WHERE claimed_by_user_id IS NOT NULL)     AS claimed,
  COUNT(*) FILTER (WHERE claimed_by_user_id IS NULL)         AS ghost,
  COUNT(*) FILTER (WHERE owner_workspace_id IS NULL)         AS no_workspace,
  COUNT(*) FILTER (WHERE legacy_org_id IS NOT NULL)          AS has_legacy_org_id,
  COUNT(*) FILTER (WHERE legacy_entity_id IS NOT NULL)       AS has_legacy_entity_id
FROM directory.entities
GROUP BY type
ORDER BY type;

-- 2. All entities with no workspace (potential orphans)
SELECT
  id,
  type,
  display_name,
  claimed_by_user_id,
  legacy_org_id,
  legacy_entity_id,
  created_at,
  attributes->>'email' AS email
FROM directory.entities
WHERE owner_workspace_id IS NULL
ORDER BY created_at DESC;

-- 3. Ghost persons (no account, no workspace) — most likely test data
SELECT
  id,
  display_name,
  attributes->>'email' AS email,
  attributes->>'is_ghost' AS is_ghost,
  legacy_entity_id,
  created_at
FROM directory.entities
WHERE type = 'person'
  AND claimed_by_user_id IS NULL
  AND owner_workspace_id IS NULL
ORDER BY created_at DESC;

-- 4. All person entities — claimed and unclaimed — with their workspace
SELECT
  e.id,
  e.display_name,
  e.claimed_by_user_id,
  e.owner_workspace_id,
  w.name AS workspace_name,
  e.attributes->>'email' AS email,
  e.attributes->>'is_ghost' AS is_ghost,
  e.created_at
FROM directory.entities e
LEFT JOIN public.workspaces w ON w.id = e.owner_workspace_id
WHERE e.type = 'person'
ORDER BY e.created_at DESC;

-- 5. All company/venue entities with their workspace
SELECT
  e.id,
  e.display_name,
  e.type,
  e.owner_workspace_id,
  w.name AS workspace_name,
  e.legacy_org_id,
  e.created_at
FROM directory.entities e
LEFT JOIN public.workspaces w ON w.id = e.owner_workspace_id
WHERE e.type IN ('company', 'venue')
ORDER BY e.created_at DESC;

-- 6. ROSTER_MEMBER edge count per person entity
--    (helps identify orphaned entities with no relationships)
SELECT
  e.id,
  e.display_name,
  e.type,
  e.owner_workspace_id,
  e.attributes->>'email' AS email,
  COUNT(r.id) AS roster_edges
FROM directory.entities e
LEFT JOIN cortex.relationships r
  ON r.source_entity_id = e.id
  AND r.relationship_type = 'ROSTER_MEMBER'
WHERE e.type = 'person'
GROUP BY e.id, e.display_name, e.type, e.owner_workspace_id, e.attributes
ORDER BY roster_edges ASC, e.created_at DESC;
