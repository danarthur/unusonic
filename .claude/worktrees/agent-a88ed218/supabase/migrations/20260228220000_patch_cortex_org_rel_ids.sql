-- Session 3: Patch legacy_org_relationship_id into cortex.relationships context_data.
-- Enables the dual-read pattern: listOrgRelationships reads from cortex.relationships
-- but returns the backward-compatible org_relationships.id for downstream UPDATE calls.
-- Data-only UPDATE; no DDL changes.

UPDATE cortex.relationships cr
SET context_data = cr.context_data || jsonb_build_object(
  'legacy_org_relationship_id', orgrel.id::text
)
FROM public.org_relationships orgrel
JOIN directory.entities de_source ON de_source.legacy_org_id = orgrel.source_org_id
JOIN directory.entities de_target ON de_target.legacy_org_id = orgrel.target_org_id
WHERE cr.source_entity_id = de_source.id
  AND cr.target_entity_id = de_target.id
  AND cr.relationship_type = CASE orgrel.type::text
    WHEN 'vendor'         THEN 'VENDOR'
    WHEN 'venue'          THEN 'VENUE_PARTNER'
    WHEN 'client_company' THEN 'CLIENT'
    WHEN 'partner'        THEN 'PARTNER'
    ELSE UPPER(orgrel.type::text)
  END
  AND orgrel.deleted_at IS NULL;
