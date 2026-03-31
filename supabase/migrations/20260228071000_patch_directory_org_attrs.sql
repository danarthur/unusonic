-- Session 2: Patch missing org lifecycle fields into directory.entities attributes
-- Adds is_ghost, is_claimed, operational_settings so the new schema has full parity
-- with public.organizations for the dual-read phase.
-- No DDL changes — data-only UPDATE.

UPDATE directory.entities de
SET attributes = COALESCE(de.attributes, '{}') || jsonb_strip_nulls(jsonb_build_object(
  'is_ghost',             o.is_ghost,
  'is_claimed',           o.is_claimed,
  'operational_settings', o.operational_settings
))
FROM public.organizations o
WHERE de.legacy_org_id = o.id;
