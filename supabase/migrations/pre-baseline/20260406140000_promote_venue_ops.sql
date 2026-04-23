-- Promote venue_ops sub-object fields to top-level attributes.
-- Preserves the old venue_ops object for backwards compat.
-- Uses jsonb_each to iterate and || to merge, with top-level taking precedence
-- on the single collision key (capacity).

DO $$
DECLARE
  r RECORD;
  ops jsonb;
  promoted jsonb;
  kv RECORD;
BEGIN
  FOR r IN
    SELECT id, attributes
    FROM directory.entities
    WHERE type = 'venue'
      AND attributes ? 'venue_ops'
      AND attributes->'venue_ops' IS NOT NULL
  LOOP
    ops := r.attributes->'venue_ops';

    -- Build promoted object from venue_ops, excluding 'capacity'
    -- (top-level capacity already exists and takes precedence)
    promoted := '{}'::jsonb;
    FOR kv IN SELECT * FROM jsonb_each(ops)
    LOOP
      IF kv.key <> 'capacity' THEN
        -- Only promote if the key is not already set at top level
        IF NOT (r.attributes ? kv.key) OR r.attributes->>kv.key IS NULL THEN
          promoted := promoted || jsonb_build_object(kv.key, kv.value);
        END IF;
      END IF;
    END LOOP;

    -- Merge promoted keys into top-level attributes (existing top-level wins)
    IF promoted <> '{}'::jsonb THEN
      UPDATE directory.entities
      SET attributes = attributes || promoted
      WHERE id = r.id;
    END IF;
  END LOOP;
END $$;
