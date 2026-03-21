-- =============================================================================
-- CLEANUP: Remove test/orphaned entities from directory.entities
-- Run in Supabase SQL Editor.
-- PREVIEW first (SELECT block), then run DELETE when confirmed.
-- =============================================================================

-- PREVIEW — see exactly what will be deleted before committing
SELECT
  id,
  display_name,
  type,
  owner_workspace_id,
  attributes->>'email' AS email,
  created_at
FROM directory.entities
WHERE id IN (
  -- @signal.local ghost UUID emails (fake addresses from old ghost creation code)
  '83e84dd3-542f-43d2-9806-aa5222a95c75', -- Caroline Leggio (ghost-...@signal.local)
  '78e256aa-145a-4d14-a76c-ec9afb3fb333', -- Gia Melendez (ghost-...@signal.local)
  '2801a749-e751-4323-bace-62378f57844a', -- Brayden Kendall (ghost-...@signal.local)
  '0da52e78-e6e4-431e-9071-58c9260735d1', -- Alexa Infranca (ghost-...@signal.local)
  'dcc2400a-215d-4a66-8ab0-680e2b048b18', -- ghost UUID display name (ghost-...@signal.local)
  '8a6937bf-1660-4af9-b86b-1af0f5072251', -- ghost UUID display name (ghost-...@signal.local)
  -- @ghost.signal.local slug emails (older ghost creation format)
  '6dac3941-84d7-4ff7-8872-1e3cd30c6727', -- caroline-leggio@ghost.signal.local
  '9fe4c4f2-8907-44fb-bc73-facd98fc986b', -- gia-melendez@ghost.signal.local
  '8462933e-c6ae-4a3e-a539-462afc9264a0', -- brayden-kendall@ghost.signal.local
  '78a7edc6-8caa-4007-a2d6-3c0877734e6f', -- alexa-infranca@ghost.signal.local
  -- Duplicate Daniel Arthur (null workspace, null email, 0 edges)
  'abed0616-764d-4313-a01b-7ce1839f197a'
);

-- =============================================================================
-- DELETE — run only after confirming the SELECT above looks correct
-- Also cleans up any dangling cortex.relationships edges first (FK safety)
-- =============================================================================

-- Step 1: Remove any cortex edges referencing these entities
DELETE FROM cortex.relationships
WHERE source_entity_id IN (
  '83e84dd3-542f-43d2-9806-aa5222a95c75',
  '78e256aa-145a-4d14-a76c-ec9afb3fb333',
  '2801a749-e751-4323-bace-62378f57844a',
  '0da52e78-e6e4-431e-9071-58c9260735d1',
  'dcc2400a-215d-4a66-8ab0-680e2b048b18',
  '8a6937bf-1660-4af9-b86b-1af0f5072251',
  '6dac3941-84d7-4ff7-8872-1e3cd30c6727',
  '9fe4c4f2-8907-44fb-bc73-facd98fc986b',
  '8462933e-c6ae-4a3e-a539-462afc9264a0',
  '78a7edc6-8caa-4007-a2d6-3c0877734e6f',
  'abed0616-764d-4313-a01b-7ce1839f197a'
)
OR target_entity_id IN (
  '83e84dd3-542f-43d2-9806-aa5222a95c75',
  '78e256aa-145a-4d14-a76c-ec9afb3fb333',
  '2801a749-e751-4323-bace-62378f57844a',
  '0da52e78-e6e4-431e-9071-58c9260735d1',
  'dcc2400a-215d-4a66-8ab0-680e2b048b18',
  '8a6937bf-1660-4af9-b86b-1af0f5072251',
  '6dac3941-84d7-4ff7-8872-1e3cd30c6727',
  '9fe4c4f2-8907-44fb-bc73-facd98fc986b',
  '8462933e-c6ae-4a3e-a539-462afc9264a0',
  '78a7edc6-8caa-4007-a2d6-3c0877734e6f',
  'abed0616-764d-4313-a01b-7ce1839f197a'
);

-- Step 2: Delete the entities
DELETE FROM directory.entities
WHERE id IN (
  '83e84dd3-542f-43d2-9806-aa5222a95c75',
  '78e256aa-145a-4d14-a76c-ec9afb3fb333',
  '2801a749-e751-4323-bace-62378f57844a',
  '0da52e78-e6e4-431e-9071-58c9260735d1',
  'dcc2400a-215d-4a66-8ab0-680e2b048b18',
  '8a6937bf-1660-4af9-b86b-1af0f5072251',
  '6dac3941-84d7-4ff7-8872-1e3cd30c6727',
  '9fe4c4f2-8907-44fb-bc73-facd98fc986b',
  '8462933e-c6ae-4a3e-a539-462afc9264a0',
  '78a7edc6-8caa-4007-a2d6-3c0877734e6f',
  'abed0616-764d-4313-a01b-7ce1839f197a'
);
