-- =============================================================================
-- Phase 2 backfill: couple entities → directory.entities
-- =============================================================================
--
-- PURPOSE
-- -------
-- This is a COMMENT-ONLY planning script. Do not run it blindly.
-- It documents the migration plan for any legacy "couple" records that were
-- stored as two separate `person` nodes (one per partner) before the couple
-- entity type was introduced.
--
-- BACKGROUND
-- ----------
-- Prior to the individual/couple client feature (Session 11+), couples were
-- often created as a single person entity with the combined name in
-- `display_name` (e.g. "Emma & James Johnson") and no structured attributes.
-- The new standard is a single entity with:
--   type = 'couple'
--   attributes->>'partner_a_first_name'
--   attributes->>'partner_a_last_name'
--   attributes->>'partner_a_email'
--   attributes->>'partner_b_first_name'
--   attributes->>'partner_b_last_name'
--   attributes->>'partner_b_email'
--   attributes->>'category' = 'client'
--
-- MIGRATION STRATEGY
-- ------------------
-- Step 1: Identify legacy single-node "couple" persons.
--   Heuristic: `type = 'person'` AND `display_name` contains ' & '
--   AND `attributes->>'category' = 'client'` (or NULL category, manual review).
--
-- Step 2: For each candidate, decide whether to:
--   (a) In-place upgrade — change type to 'couple', split display_name into
--       partner_a / partner_b attributes. Best when both last names are the same
--       (e.g. "Emma & James Johnson").
--   (b) Create a new couple entity and re-point the deal_stakeholder row to it.
--       Best when the display_name is ambiguous.
--
-- Step 3: Re-point cortex.relationships edges.
--   The old person entity had a CLIENT edge from the workspace org. After
--   conversion/replacement, run upsert_relationship RPC for the new entity.
--
-- =============================================================================
-- DIAGNOSTIC: find candidate legacy couples
-- =============================================================================

/*
SELECT
  id,
  display_name,
  type,
  attributes->>'category'    AS category,
  attributes->>'first_name'  AS first_name,
  owner_workspace_id
FROM directory.entities
WHERE type = 'person'
  AND display_name ILIKE '% & %'
  AND (attributes->>'category' = 'client' OR attributes->>'category' IS NULL)
ORDER BY owner_workspace_id, display_name;
*/

-- =============================================================================
-- OPTION A: In-place type upgrade (same-last-name couples)
-- Replace <entity_id> with the actual UUID from the diagnostic above.
-- =============================================================================

/*
UPDATE directory.entities
SET
  type       = 'couple',
  attributes = jsonb_set(
    jsonb_set(
      jsonb_set(
        jsonb_set(
          COALESCE(attributes, '{}'::jsonb),
          '{partner_a_first_name}', to_jsonb(trim(split_part(display_name, ' & ', 1)))
        ),
        '{partner_b_first_name}', to_jsonb(trim(split_part(split_part(display_name, ' & ', 2), ' ', 1)))
      ),
      '{partner_a_last_name}', to_jsonb(trim(split_part(display_name, ' ', array_length(string_to_array(display_name, ' '), 1))))
    ),
    '{partner_b_last_name}', to_jsonb(trim(split_part(display_name, ' ', array_length(string_to_array(display_name, ' '), 1))))
  ) || '{"category": "client", "is_ghost": true}'::jsonb
WHERE id = '<entity_id>';
*/

-- =============================================================================
-- OPTION B: Create a new couple entity and re-point deal_stakeholder
-- =============================================================================

/*
-- 1. Insert new couple entity
INSERT INTO directory.entities (
  id,
  owner_workspace_id,
  type,
  display_name,
  attributes,
  claimed_by_user_id,
  created_at,
  updated_at
)
VALUES (
  gen_random_uuid(),
  '<workspace_id>',
  'couple',
  '<display_name>',  -- e.g. 'Emma & James Johnson'
  jsonb_build_object(
    'is_ghost',              true,
    'category',              'client',
    'partner_a_first_name',  '<partner_a_first>',
    'partner_a_last_name',   '<partner_a_last>',
    'partner_a_email',       '<partner_a_email_or_null>',
    'partner_b_first_name',  '<partner_b_first>',
    'partner_b_last_name',   '<partner_b_last>',
    'partner_b_email',       '<partner_b_email_or_null>'
  ),
  NULL,  -- ghost: no Unusonic account
  now(),
  now()
)
RETURNING id;  -- capture as <new_couple_entity_id>

-- 2. Re-point deal_stakeholder rows from old person entity to new couple entity
UPDATE ops.deal_stakeholders
SET entity_id = '<new_couple_entity_id>'
WHERE entity_id = '<old_person_entity_id>';

-- 3. Create CLIENT cortex edge for new couple entity via RPC (run from app code or psql)
-- SELECT upsert_relationship(
--   p_source_entity_id => '<workspace_org_entity_id>',
--   p_target_entity_id => '<new_couple_entity_id>',
--   p_type             => 'CLIENT',
--   p_context_data     => '{"direction": "client"}'::jsonb
-- );

-- 4. Optionally delete the old person entity if it has no other relationships
-- DELETE FROM directory.entities WHERE id = '<old_person_entity_id>';
*/
