-- =============================================================================
-- Debug script: dedupe duplicate person entities referenced by the same deal
--               via different ops.deal_stakeholders roles.
--
-- Run in Supabase SQL Editor. Sections are independent — read §1 output before
-- running §2 or §3.
--
-- Background: prior to migration 20260427120000, public.create_deal_complete
-- inserted a second directory.entities row whenever the same person was
-- passed as both p_hosts[i] and p_poc / p_planner / p_bill_to. The header
-- strip rendered them twice because the UI dedupe in people-strip.tsx keys
-- on entity_id, not on (first_name, last_name, email).
--
-- This script:
--   §1 — DETECTION (read-only). Lists every workspace + deal where two
--        ops.deal_stakeholders rows on the same deal point at different
--        directory.entities whose normalized (first, last, email) signature
--        matches. Includes a recommended canonical pick.
--   §2 — TARGETED FIX for the "Bryan & Jessica Wedding" case Daniel
--        confirmed. Hard-coded uuids; review §1 output first to confirm
--        no other deals share either uuid.
--   §3 — GENERIC MERGE TEMPLATE. Same logic as §2 with placeholders. For
--        each pair §1 surfaces, copy + fill in canonical_id / duplicate_id
--        and run.
--
-- Tie-break for canonical pick (when neither entity is a host on the deal):
--   1. The entity referenced by the deal's host-role row wins.
--   2. Otherwise: oldest created_at, then lowest uuid.
-- =============================================================================


-- §1 ─────────────────────────────────────────────────────────────────────────
-- DETECTION (read-only). Run this first.
-- Lists every (deal, person-name, person-email) where two stakeholder rows on
-- the same deal point at distinct directory.entities sharing a normalized
-- signature. Output columns let you decide which entity is canonical.

WITH ranked AS (
  SELECT
    d.workspace_id,
    d.id                          AS deal_id,
    d.title                       AS deal_title,
    ds.id                         AS stakeholder_id,
    ds.role                       AS role,
    ds.entity_id                  AS entity_id,
    e.created_at                  AS entity_created_at,
    e.display_name                AS entity_display_name,
    lower(btrim(COALESCE(e.attributes ->> 'first_name', ''))) AS sig_first,
    lower(btrim(COALESCE(e.attributes ->> 'last_name',  ''))) AS sig_last,
    lower(btrim(COALESCE(e.attributes ->> 'email',      ''))) AS sig_email
  FROM ops.deal_stakeholders ds
  JOIN public.deals d        ON d.id = ds.deal_id
  JOIN directory.entities e  ON e.id = ds.entity_id
  WHERE e.type = 'person'
    AND ds.entity_id IS NOT NULL
)
SELECT
  workspace_id,
  deal_id,
  deal_title,
  sig_first || ' ' || sig_last AS person,
  NULLIF(sig_email, '')        AS person_email,
  jsonb_agg(jsonb_build_object(
    'role', role,
    'stakeholder_id', stakeholder_id,
    'entity_id', entity_id,
    'entity_display_name', entity_display_name,
    'entity_created_at', entity_created_at,
    'is_host', role = 'host'
  ) ORDER BY (role = 'host') DESC, entity_created_at ASC, entity_id ASC) AS rows,
  -- Canonical: host wins; else oldest entity; else lowest uuid.
  (array_agg(entity_id ORDER BY (role = 'host') DESC, entity_created_at ASC, entity_id ASC))[1] AS canonical_entity_id,
  -- Duplicates: every entity_id except the canonical, distinct.
  ARRAY(
    SELECT DISTINCT ent
    FROM unnest(array_agg(entity_id ORDER BY (role = 'host') DESC, entity_created_at ASC, entity_id ASC)) WITH ORDINALITY AS u(ent, ord)
    WHERE ord > 1 AND ent <> (array_agg(entity_id ORDER BY (role = 'host') DESC, entity_created_at ASC, entity_id ASC))[1]
  ) AS duplicate_entity_ids
FROM ranked
GROUP BY workspace_id, deal_id, deal_title, sig_first, sig_last, sig_email
HAVING COUNT(DISTINCT entity_id) > 1
   AND (sig_first <> '' OR sig_last <> '')
ORDER BY workspace_id, deal_id;


-- §2 ─────────────────────────────────────────────────────────────────────────
-- TARGETED FIX: Bryan & Jessica Wedding (workspace 96feecb1-...).
-- canonical = c9ca465d-f8a6-4e33-853b-9c8dd1e76f65 (host)
-- duplicate = 8929fc0b-da13-410d-a5e0-db5a3eb04ef8 (day_of_poc)
--
-- Wrapped in a single transaction. Comment out / re-enable as needed.
-- Confirm §1 shows exactly this pair and no others share these uuids before
-- running.

BEGIN;

-- 2a. Repoint every ops.deal_stakeholders row on any deal that points at the
--     duplicate. (Scoped explicitly — should only affect day_of_poc on the
--     Bryan & Jessica deal, but defensive.)
UPDATE ops.deal_stakeholders ds
SET entity_id = 'c9ca465d-f8a6-4e33-853b-9c8dd1e76f65'::uuid
WHERE ds.entity_id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid;

-- 2b. Repoint cortex.relationships edges from dup → canonical, both source
--     and target sides. ON CONFLICT skips edges that would collide with an
--     existing canonical edge of the same (source, target, type) — those
--     are dropped by 2c below.
UPDATE cortex.relationships r
SET source_entity_id = 'c9ca465d-f8a6-4e33-853b-9c8dd1e76f65'::uuid
WHERE r.source_entity_id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM cortex.relationships r2
    WHERE r2.source_entity_id = 'c9ca465d-f8a6-4e33-853b-9c8dd1e76f65'::uuid
      AND r2.target_entity_id = r.target_entity_id
      AND r2.relationship_type = r.relationship_type
  );

UPDATE cortex.relationships r
SET target_entity_id = 'c9ca465d-f8a6-4e33-853b-9c8dd1e76f65'::uuid
WHERE r.target_entity_id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM cortex.relationships r2
    WHERE r2.source_entity_id = r.source_entity_id
      AND r2.target_entity_id = 'c9ca465d-f8a6-4e33-853b-9c8dd1e76f65'::uuid
      AND r2.relationship_type = r.relationship_type
  );

-- 2c. Drop any edges still touching the dup (collisions with canonical that
--     2b's NOT EXISTS skipped, plus would-be self-loops if dup was on both
--     sides of an edge with canonical already).
DELETE FROM cortex.relationships
WHERE source_entity_id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid
   OR target_entity_id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid;

-- 2d. Delete the orphaned duplicate entity. Will fail loudly if any FK still
--     references it — that's the safety net that catches missed repoint
--     paths.
DELETE FROM directory.entities
WHERE id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid;

-- Verification before commit. Both should return zero rows.
SELECT 'leftover_stakeholders' AS check, COUNT(*) AS n
FROM ops.deal_stakeholders
WHERE entity_id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid
UNION ALL
SELECT 'leftover_edges', COUNT(*)
FROM cortex.relationships
WHERE source_entity_id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid
   OR target_entity_id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid
UNION ALL
SELECT 'leftover_entity', COUNT(*)
FROM directory.entities
WHERE id = '8929fc0b-da13-410d-a5e0-db5a3eb04ef8'::uuid;

-- Inspect the verification rows. If all zero, commit. If any non-zero,
-- rollback and investigate.
COMMIT;
-- ROLLBACK;


-- §3 ─────────────────────────────────────────────────────────────────────────
-- GENERIC MERGE TEMPLATE. For each duplicate pair §1 surfaces, copy this
-- block, replace the placeholders, and run inside its own transaction.
-- Keep one pair per transaction so a single bad pick doesn't take down the
-- batch.
--
-- :canonical_id  — the entity_id you want to keep (host's entity is usually right)
-- :duplicate_id  — the entity_id to be merged into canonical
--
-- Uncomment and edit when ready. Section is wrapped in /* */ to prevent
-- accidental execution if the file is loaded whole.

/*
BEGIN;

UPDATE ops.deal_stakeholders ds
SET entity_id = ':canonical_id'::uuid
WHERE ds.entity_id = ':duplicate_id'::uuid;

UPDATE cortex.relationships r
SET source_entity_id = ':canonical_id'::uuid
WHERE r.source_entity_id = ':duplicate_id'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM cortex.relationships r2
    WHERE r2.source_entity_id = ':canonical_id'::uuid
      AND r2.target_entity_id = r.target_entity_id
      AND r2.relationship_type = r.relationship_type
  );

UPDATE cortex.relationships r
SET target_entity_id = ':canonical_id'::uuid
WHERE r.target_entity_id = ':duplicate_id'::uuid
  AND NOT EXISTS (
    SELECT 1 FROM cortex.relationships r2
    WHERE r2.source_entity_id = r.source_entity_id
      AND r2.target_entity_id = ':canonical_id'::uuid
      AND r2.relationship_type = r.relationship_type
  );

DELETE FROM cortex.relationships
WHERE source_entity_id = ':duplicate_id'::uuid
   OR target_entity_id = ':duplicate_id'::uuid;

DELETE FROM directory.entities
WHERE id = ':duplicate_id'::uuid;

SELECT 'leftover_stakeholders' AS check, COUNT(*) AS n
FROM ops.deal_stakeholders WHERE entity_id = ':duplicate_id'::uuid
UNION ALL
SELECT 'leftover_edges', COUNT(*)
FROM cortex.relationships
WHERE source_entity_id = ':duplicate_id'::uuid OR target_entity_id = ':duplicate_id'::uuid
UNION ALL
SELECT 'leftover_entity', COUNT(*)
FROM directory.entities WHERE id = ':duplicate_id'::uuid;

COMMIT;
-- ROLLBACK;
*/
