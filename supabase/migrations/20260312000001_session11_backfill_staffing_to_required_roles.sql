-- Migration 4 — Backfill definition.staffing → definition.required_roles[] on Package Bundles
-- Session: Catalog Session 11 (Feature Brief March 2026)
-- Run AFTER Migration 3 is verified and TypeScript deploys are confirmed.
-- DO NOT apply until resolveRequiredRoles() is confirmed in production.

-- Step 1: Backfill definition.staffing into required_roles[] on package bundles.
-- Only affects rows where:
--   1. category is 'package'
--   2. definition.staffing.required = 'true' and staffing.role is non-null
--   3. definition.required_roles does NOT already exist

UPDATE public.packages
SET definition = jsonb_set(
  definition,
  '{required_roles}',
  jsonb_build_array(
    jsonb_build_object(
      'role',          definition->'staffing'->>'role',
      'booking_type',  'labor',
      'quantity',      1,
      'default_rate',  NULL,
      'default_hours', NULL,
      'entity_id',     definition->'staffing'->>'defaultStaffId'
    )
  )
)
WHERE category = 'package'
  AND definition->'staffing'->>'required' = 'true'
  AND definition->'staffing'->>'role' IS NOT NULL
  AND definition->'required_roles' IS NULL;

-- Verify row counts before running Step 2:
--   SELECT COUNT(*) FROM public.packages
--   WHERE category = 'package'
--     AND definition->'required_roles' IS NOT NULL;
-- Count should equal the number of rows updated above.

-- Step 2 (run after verifying row counts match Step 1 output):
-- Removes the now-redundant staffing key from the definition JSONB.
-- This is safe once all bundle consumers use resolveRequiredRoles() exclusively.

-- UPDATE public.packages
-- SET definition = definition - 'staffing'
-- WHERE category = 'package'
--   AND definition->'required_roles' IS NOT NULL
--   AND definition ? 'staffing';
