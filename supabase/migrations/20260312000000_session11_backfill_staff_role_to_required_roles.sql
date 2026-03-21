-- Migration 3 — Backfill ingredient_meta.staff_role → definition.required_roles[]
-- Session: Catalog Session 11 (Feature Brief March 2026)
-- Run AFTER TypeScript deploys are verified in production.
-- DO NOT apply this migration until the new sync pipeline (get-crew-roles-from-proposal.ts)
-- is confirmed working via resolveRequiredRoles() fallback.

-- Step 1: Backfill staff_role into required_roles[] on Labor/Service and Talent items.
-- Only affects rows where:
--   1. category is 'service' or 'talent'
--   2. definition.ingredient_meta.staff_role is non-null
--   3. definition.required_roles does NOT already exist (avoids overwriting new-format items)

UPDATE public.packages
SET definition = jsonb_set(
  definition,
  '{required_roles}',
  jsonb_build_array(
    jsonb_build_object(
      'role',          definition->'ingredient_meta'->>'staff_role',
      'booking_type',  'labor',
      'quantity',      1,
      'default_rate',  NULL,
      'default_hours', (definition->'ingredient_meta'->>'duration_hours')::numeric
    )
  )
)
WHERE category IN ('service', 'talent')
  AND definition->'ingredient_meta'->>'staff_role' IS NOT NULL
  AND definition->'required_roles' IS NULL;

-- Verify row counts before running Step 2:
--   SELECT COUNT(*) FROM public.packages
--   WHERE category IN ('service', 'talent')
--     AND definition->'required_roles' IS NOT NULL;
-- Count should equal the number of rows updated above.

-- Step 2 (run after verifying row counts match Step 1 output):
-- Removes the now-redundant staff_role field from ingredient_meta.
-- This is safe once resolveRequiredRoles() canonical path (required_roles[]) is confirmed working.

-- UPDATE public.packages
-- SET definition = definition #- '{ingredient_meta,staff_role}'
-- WHERE category IN ('service', 'talent')
--   AND definition->'required_roles' IS NOT NULL
--   AND definition->'ingredient_meta'->>'staff_role' IS NOT NULL;
