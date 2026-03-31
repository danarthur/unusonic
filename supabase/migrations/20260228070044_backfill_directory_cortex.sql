-- =============================================================================
-- Session 1: Infrastructure + Backfill — Directory entities and Cortex relationships
--
-- This migration:
--   1. Adds transitional backfill columns (legacy_org_id, legacy_entity_id) to directory.entities
--   2. Backfills directory.entities from public.organizations
--   3. Backfills directory.entities from public.entities (people)
--   4. Creates public.upsert_relationship() SECURITY DEFINER RPC for app writes
--   5. Backfills cortex.relationships from public.affiliations (MEMBER edges)
--   6. Backfills cortex.relationships from public.org_relationships (org-to-org edges)
--   7. Backfills cortex.relationships from public.org_members (ROSTER_MEMBER edges)
--
-- SAFE: No legacy tables are dropped. Dual-read strategy holds until pass 4 cutover.
-- Idempotent: All inserts use WHERE NOT EXISTS or ON CONFLICT DO NOTHING.
-- =============================================================================

-- =============================================================================
-- 1. Add backfill bridge columns to directory.entities
-- =============================================================================

ALTER TABLE directory.entities
  ADD COLUMN IF NOT EXISTS legacy_org_id    uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS legacy_entity_id uuid REFERENCES public.entities(id)       ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_directory_entities_legacy_org_id
  ON directory.entities(legacy_org_id) WHERE legacy_org_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_directory_entities_legacy_entity_id
  ON directory.entities(legacy_entity_id) WHERE legacy_entity_id IS NOT NULL;

COMMENT ON COLUMN directory.entities.legacy_org_id    IS 'Transitional bridge: points to public.organizations during migration. Null after cutover.';
COMMENT ON COLUMN directory.entities.legacy_entity_id IS 'Transitional bridge: points to public.entities during migration. Null after cutover.';

-- =============================================================================
-- 2. Backfill directory.entities from public.organizations
--    category = 'venue' → type = 'venue', everything else → type = 'company'
--    Extra attributes stored in JSONB; nulls stripped.
-- =============================================================================

INSERT INTO directory.entities (
  owner_workspace_id,
  type,
  display_name,
  handle,
  avatar_url,
  attributes,
  legacy_org_id,
  created_at,
  updated_at
)
SELECT
  o.workspace_id,
  CASE WHEN o.category::text = 'venue' THEN 'venue' ELSE 'company' END,
  o.name,
  o.slug,
  o.logo_url,
  jsonb_strip_nulls(jsonb_build_object(
    'description',      o.description,
    'website',          o.website,
    'brand_color',      o.brand_color,
    'tier',             o.tier,
    'address',          o.address,
    'social_links',     o.social_links,
    'support_email',    o.support_email,
    'category',         o.category::text,
    'default_currency', o.default_currency
  )),
  o.id,
  COALESCE(o.created_at, now()),
  COALESCE(o.updated_at, now())
FROM public.organizations o
WHERE NOT EXISTS (
  SELECT 1 FROM directory.entities de WHERE de.legacy_org_id = o.id
);

-- =============================================================================
-- 3. Backfill directory.entities from public.entities (people)
--    claimed_by_user_id = auth_id for non-ghost accounts.
--    display_name: first available name from org_members, fallback to email prefix.
-- =============================================================================

INSERT INTO directory.entities (
  claimed_by_user_id,
  type,
  display_name,
  attributes,
  legacy_entity_id,
  created_at,
  updated_at
)
SELECT
  CASE WHEN e.is_ghost = false THEN e.auth_id ELSE NULL END,
  'person',
  COALESCE(
    NULLIF(TRIM(
      COALESCE(
        (SELECT CONCAT(om.first_name, ' ', om.last_name)
         FROM public.org_members om
         WHERE om.entity_id = e.id
           AND om.first_name IS NOT NULL
         LIMIT 1),
        ''
      )
    ), ''),
    split_part(e.email, '@', 1)
  ),
  jsonb_build_object('email', e.email, 'is_ghost', e.is_ghost),
  e.id,
  e.created_at,
  e.updated_at
FROM public.entities e
WHERE NOT EXISTS (
  SELECT 1 FROM directory.entities de WHERE de.legacy_entity_id = e.id
);

-- =============================================================================
-- 4. Create upsert_relationship() SECURITY DEFINER RPC
--    App code calls this to write cortex edges without direct INSERT access.
--    Validates that the source entity belongs to the caller's workspace before
--    bypassing cortex.relationships SELECT-only RLS.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.upsert_relationship(
  p_source_entity_id uuid,
  p_target_entity_id uuid,
  p_type             text,
  p_context_data     jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id                  uuid;
  v_source_workspace_id uuid;
BEGIN
  -- Verify source entity belongs to caller's workspace
  SELECT owner_workspace_id INTO v_source_workspace_id
  FROM directory.entities
  WHERE id = p_source_entity_id;

  IF v_source_workspace_id IS NULL OR
     v_source_workspace_id NOT IN (SELECT get_my_workspace_ids()) THEN
    RAISE EXCEPTION 'access denied: source entity not in caller workspace';
  END IF;

  INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
  VALUES (p_source_entity_id, p_target_entity_id, p_type, p_context_data)
  ON CONFLICT (source_entity_id, target_entity_id, relationship_type)
  DO UPDATE SET context_data = EXCLUDED.context_data
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION public.upsert_relationship(uuid, uuid, text, jsonb) IS
  'Creates or updates a cortex relationship edge. SECURITY DEFINER — validates caller owns the source entity workspace before bypassing cortex.relationships RLS. Use (SELECT upsert_relationship(...)) in app code.';

GRANT EXECUTE ON FUNCTION public.upsert_relationship(uuid, uuid, text, jsonb) TO authenticated;

-- =============================================================================
-- 5. Backfill cortex.relationships from public.affiliations (MEMBER edges)
--    person (source) → organization (target), type = MEMBER
-- =============================================================================

INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
SELECT
  de_person.id,
  de_org.id,
  'MEMBER',
  jsonb_strip_nulls(jsonb_build_object(
    'role_label',   a.role_label,
    'status',       a.status,
    'access_level', a.access_level::text
  ))
FROM public.affiliations a
JOIN directory.entities de_person ON de_person.legacy_entity_id = a.entity_id
JOIN directory.entities de_org    ON de_org.legacy_org_id       = a.organization_id
ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;

-- =============================================================================
-- 6. Backfill cortex.relationships from public.org_relationships (org-to-org edges)
--    type mapping: vendor→VENDOR, venue→VENUE_PARTNER, client_company→CLIENT, partner→PARTNER
--    Skips soft-deleted rows (deleted_at IS NOT NULL).
-- =============================================================================

INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
SELECT
  de_source.id,
  de_target.id,
  CASE orgrel.type::text
    WHEN 'vendor'         THEN 'VENDOR'
    WHEN 'venue'          THEN 'VENUE_PARTNER'
    WHEN 'client_company' THEN 'CLIENT'
    WHEN 'partner'        THEN 'PARTNER'
    ELSE UPPER(orgrel.type::text)
  END,
  jsonb_strip_nulls(jsonb_build_object(
    'tier',             orgrel.tier::text,
    'notes',            orgrel.notes,
    'tags',             orgrel.tags,
    'lifecycle_status', orgrel.lifecycle_status
  ))
FROM public.org_relationships orgrel
JOIN directory.entities de_source ON de_source.legacy_org_id = orgrel.source_org_id
JOIN directory.entities de_target ON de_target.legacy_org_id = orgrel.target_org_id
WHERE orgrel.deleted_at IS NULL
ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;

-- =============================================================================
-- 7. Backfill cortex.relationships from public.org_members (ROSTER_MEMBER edges)
--    Only org_members where entity_id IS NOT NULL (ghost-only rows have no directory node yet).
--    person (source) → organization (target), type = ROSTER_MEMBER
-- =============================================================================

INSERT INTO cortex.relationships (source_entity_id, target_entity_id, relationship_type, context_data)
SELECT
  de_person.id,
  de_org.id,
  'ROSTER_MEMBER',
  jsonb_strip_nulls(jsonb_build_object(
    'job_title',           om.job_title,
    'role',                om.role::text,
    'employment_status',   om.employment_status::text,
    'default_hourly_rate', om.default_hourly_rate
  ))
FROM public.org_members om
JOIN directory.entities de_person ON de_person.legacy_entity_id = om.entity_id
JOIN directory.entities de_org    ON de_org.legacy_org_id       = om.org_id
WHERE om.entity_id IS NOT NULL
ON CONFLICT (source_entity_id, target_entity_id, relationship_type) DO NOTHING;
