-- =============================================================================
-- Split legacy couple entities into two person Nodes (STAGING RUNBOOK).
--
-- Runs on staging only. Production migration is deferred to P1, after the
-- finance.invoices QBO resolution layer lands so that issued invoices retain
-- their V1 snapshots cleanly and re-pointing bill_to_entity_id is safe.
--
-- ── Why this is a runbook, not a tracked migration ─────────────────────────
-- Migrations in supabase/migrations/ must be deterministic across all
-- environments. A `current_database() = 'unusonic_staging'` gate inside a
-- migration is brittle (fires only against a literal name; silently no-ops
-- against preview branches; flips truthiness on a staging-→-prod rename).
-- The existing scripts/debug/backfill-couple-entities-to-person-nodes.sql
-- establishes the runbook precedent for couple-related data work.
--
-- ── Pre-flight ─────────────────────────────────────────────────────────────
-- 1. Verify you are connected to staging:
--      SELECT current_database();
--      → must be the staging database. ABORT if it returns the prod name.
-- 2. Snapshot the affected tables before running:
--      \copy directory.entities TO 'directory_entities_pre_split.csv' CSV HEADER
--      \copy ops.deal_stakeholders TO 'ops_deal_stakeholders_pre_split.csv' CSV HEADER
-- 3. Confirm you can roll back via the snapshots if anything goes sideways.
--
-- ── What the script does ───────────────────────────────────────────────────
-- For each row in directory.entities where type = 'couple':
--   1. Insert two new `person` rows from the partner_a_* / partner_b_* JSONB
--      attributes. Preserves owner_workspace_id, claimed_by_user_id (NULL for
--      both — partners are independent ghosts).
--   2. Write a CO_HOST directed-pair edge (pairing = 'romantic') between the
--      two new person ids.
--   3. Re-point ops.deal_stakeholders rows whose entity_id == couple.id to
--      partner_a's new person id, and add a sibling row for partner_b with
--      role = 'host', is_primary = false, display_order = 2. Sets the
--      partner_a row's role = 'host' is_primary = true display_order = 1.
--   4. Re-point ops.events.client_entity_id, ops.projects.client_entity_id,
--      and finance.invoices.bill_to_entity_id from couple.id → partner_a id.
--   5. Soft-delete the couple row by setting deleted_at = now(). Issued
--      invoice V1 snapshots may still reference the couple id; do not hard
--      delete in P0.
--
-- ── Verification ───────────────────────────────────────────────────────────
-- After running, the verification block below should report:
--   - couples_soft_deleted * 2  == new_person_rows
--   - couples_soft_deleted      == co_host_edge_pairs (one pair per couple)
--   - 0 unmigrated couple rows
-- =============================================================================

BEGIN;

-- ── Safety gate ────────────────────────────────────────────────────────────
-- Refuse to run unless the operator explicitly asserts they want it. Set the
-- session variable BEFORE \i'ing this file:
--   SET unusonic.staging_couple_split = 'CONFIRMED';
DO $$
BEGIN
  IF current_setting('unusonic.staging_couple_split', true) IS DISTINCT FROM 'CONFIRMED' THEN
    RAISE EXCEPTION
      'Refusing to run split_couples_staging.sql. Operator must SET unusonic.staging_couple_split = ''CONFIRMED''; first.';
  END IF;
END$$;

-- ── Worktable: every couple to split ──────────────────────────────────────
CREATE TEMP TABLE couples_to_split ON COMMIT DROP AS
SELECT
  c.id AS couple_id,
  c.owner_workspace_id,
  c.created_at,
  c.attributes ->> 'partner_a_first_name' AS a_first,
  c.attributes ->> 'partner_a_last_name'  AS a_last,
  c.attributes ->> 'partner_a_email'      AS a_email,
  c.attributes ->> 'partner_b_first_name' AS b_first,
  c.attributes ->> 'partner_b_last_name'  AS b_last,
  c.attributes ->> 'partner_b_email'      AS b_email,
  c.attributes ->> 'category'             AS category
FROM directory.entities c
WHERE c.type = 'couple'
  AND (c.deleted_at IS NULL);

-- Add destination ids (one row per couple → two new person uuids)
ALTER TABLE couples_to_split
  ADD COLUMN partner_a_id uuid,
  ADD COLUMN partner_b_id uuid;

UPDATE couples_to_split
SET partner_a_id = gen_random_uuid(),
    partner_b_id = gen_random_uuid();

-- ── 1. Insert partner_a person rows ───────────────────────────────────────
INSERT INTO directory.entities (
  id, owner_workspace_id, type, display_name, claimed_by_user_id, attributes, created_at
)
SELECT
  c.partner_a_id,
  c.owner_workspace_id,
  'person',
  TRIM(CONCAT_WS(' ', c.a_first, c.a_last)),
  NULL,
  jsonb_strip_nulls(jsonb_build_object(
    'is_ghost',   true,
    'category',   COALESCE(c.category, 'client'),
    'first_name', c.a_first,
    'last_name',  c.a_last,
    'email',      c.a_email
  )),
  c.created_at
FROM couples_to_split c
WHERE COALESCE(c.a_first, c.a_last) IS NOT NULL;

-- ── 1b. Insert partner_b person rows ──────────────────────────────────────
INSERT INTO directory.entities (
  id, owner_workspace_id, type, display_name, claimed_by_user_id, attributes, created_at
)
SELECT
  c.partner_b_id,
  c.owner_workspace_id,
  'person',
  TRIM(CONCAT_WS(' ', c.b_first, c.b_last)),
  NULL,
  jsonb_strip_nulls(jsonb_build_object(
    'is_ghost',   true,
    'category',   COALESCE(c.category, 'client'),
    'first_name', c.b_first,
    'last_name',  c.b_last,
    'email',      c.b_email
  )),
  c.created_at
FROM couples_to_split c
WHERE COALESCE(c.b_first, c.b_last) IS NOT NULL;

-- ── 2. CO_HOST directed-pair edges (one row per direction) ────────────────
-- pairing = 'romantic' is the safe default. Manual reclassification (family /
-- co_host) happens after the split via the deal-detail UI.
INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
SELECT
  c.partner_a_id,
  c.partner_b_id,
  'CO_HOST',
  jsonb_build_object('pairing', 'romantic', 'anniversary_date', NULL)
FROM couples_to_split c
WHERE COALESCE(c.a_first, c.a_last) IS NOT NULL
  AND COALESCE(c.b_first, c.b_last) IS NOT NULL
ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;

INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
SELECT
  c.partner_b_id,
  c.partner_a_id,
  'CO_HOST',
  jsonb_build_object('pairing', 'romantic', 'anniversary_date', NULL)
FROM couples_to_split c
WHERE COALESCE(c.a_first, c.a_last) IS NOT NULL
  AND COALESCE(c.b_first, c.b_last) IS NOT NULL
ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;

-- ── 3. Re-point ops.deal_stakeholders ─────────────────────────────────────
-- Every couple-pointing stakeholder row becomes the partner_a host row.
UPDATE ops.deal_stakeholders s
SET entity_id    = c.partner_a_id,
    role         = 'host'::public.deal_stakeholder_role,
    is_primary   = true,
    display_order = 1
FROM couples_to_split c
WHERE s.entity_id = c.couple_id;

-- And insert a sibling host row for partner_b on each affected deal.
INSERT INTO ops.deal_stakeholders (deal_id, entity_id, role, is_primary, display_order)
SELECT DISTINCT
  s.deal_id,
  c.partner_b_id,
  'host'::public.deal_stakeholder_role,
  false,
  2::smallint
FROM ops.deal_stakeholders s
JOIN couples_to_split c ON c.partner_a_id = s.entity_id
WHERE c.partner_b_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM ops.deal_stakeholders s2
    WHERE s2.deal_id = s.deal_id
      AND s2.entity_id = c.partner_b_id
      AND s2.role = 'host'
  );

-- ── 4. Re-point downstream FK-ish columns ─────────────────────────────────
UPDATE ops.events e
SET client_entity_id = c.partner_a_id
FROM couples_to_split c
WHERE e.client_entity_id = c.couple_id;

UPDATE ops.projects p
SET client_entity_id = c.partner_a_id
FROM couples_to_split c
WHERE p.client_entity_id = c.couple_id;

UPDATE finance.invoices i
SET bill_to_entity_id = c.partner_a_id
FROM couples_to_split c
WHERE i.bill_to_entity_id = c.couple_id;

-- ── 5. Soft-delete the couple rows ────────────────────────────────────────
-- DO NOT hard-delete: issued invoice V1 snapshots may reference the couple id
-- and we need that row resolvable for historical display.
UPDATE directory.entities e
SET deleted_at = now()
FROM couples_to_split c
WHERE e.id = c.couple_id;

-- ── Verification block ────────────────────────────────────────────────────
DO $$
DECLARE
  v_couples_split int;
  v_new_persons int;
  v_co_host_pairs int;
  v_unmigrated int;
BEGIN
  SELECT count(*) INTO v_couples_split FROM couples_to_split;
  SELECT count(*) INTO v_new_persons
    FROM directory.entities e
    JOIN couples_to_split c ON e.id IN (c.partner_a_id, c.partner_b_id);
  SELECT count(*) / 2 INTO v_co_host_pairs
    FROM cortex.relationships r
    JOIN couples_to_split c ON
      (r.source_entity_id = c.partner_a_id AND r.target_entity_id = c.partner_b_id)
      OR (r.source_entity_id = c.partner_b_id AND r.target_entity_id = c.partner_a_id)
    WHERE r.relationship_type = 'CO_HOST';
  SELECT count(*) INTO v_unmigrated
    FROM directory.entities e WHERE e.type = 'couple' AND e.deleted_at IS NULL;

  RAISE NOTICE 'Split couples staging — verification:';
  RAISE NOTICE '  Couples soft-deleted: %', v_couples_split;
  RAISE NOTICE '  New person rows:      % (expected: % * 2 = %)', v_new_persons, v_couples_split, v_couples_split * 2;
  RAISE NOTICE '  CO_HOST edge pairs:   % (expected: %)', v_co_host_pairs, v_couples_split;
  RAISE NOTICE '  Unmigrated couples:   % (expected: 0)', v_unmigrated;

  IF v_unmigrated > 0 THEN
    RAISE EXCEPTION 'Aborting commit: % couple rows still un-migrated.', v_unmigrated;
  END IF;
END$$;

COMMIT;
