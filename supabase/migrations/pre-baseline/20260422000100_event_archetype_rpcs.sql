-- =============================================================================
-- Event archetype RPCs — normalize / upsert / archive / unarchive / rename / merge
--
-- Mirrors the TS normalizer at src/shared/lib/event-archetype.ts. Pipeline:
--   1. NFKC normalize
--   2. Trim + collapse whitespace
--   3. Lowercase
--   4. Strip non [a-z0-9 -]
--   5. Collapse runs of space/hyphen to single underscore; trim _; compress _
--   6. Singularize trailing s / es when safe (stem ≥4 chars, stopword guard)
--
-- Member capability:
--   - member / admin / owner can UPSERT (create) a custom type.
--   - admin / owner can ARCHIVE, UNARCHIVE, RENAME, MERGE.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.normalize_event_archetype_label(p_label text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path = ''
AS $function$
  WITH a AS (
    SELECT trim(lower(regexp_replace(normalize(p_label, NFKC), '\s+', ' ', 'g'))) AS s
  ),
  b AS (SELECT regexp_replace(s, '[^a-z0-9 \-]+', '', 'g') AS s FROM a),
  c AS (SELECT regexp_replace(s, '[ \-]+', '_', 'g') AS s FROM b),
  d AS (SELECT regexp_replace(trim(s, '_'), '_+', '_', 'g') AS s FROM c),
  e AS (
    SELECT
      CASE
        WHEN s ~ '(ss|us|is)es$' THEN regexp_replace(s, 'es$', '')
        WHEN s ~ 'ies$' AND length(s) >= 5 THEN regexp_replace(s, 'ies$', 'y')
        WHEN s ~ '(ch|sh|x|z)es$' THEN regexp_replace(s, 'es$', '')
        WHEN s ~ 's$'
             AND s !~ 'ss$'
             AND length(s) >= 5
             AND s NOT IN ('business','process','focus','gas','plus','jazz','miss','boss','cross')
        THEN regexp_replace(s, 's$', '')
        ELSE s
      END AS s
    FROM d
  )
  SELECT s FROM e;
$function$;

REVOKE ALL ON FUNCTION ops.normalize_event_archetype_label(text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.normalize_event_archetype_label(text) FROM anon;
GRANT EXECUTE ON FUNCTION ops.normalize_event_archetype_label(text) TO authenticated;
GRANT EXECUTE ON FUNCTION ops.normalize_event_archetype_label(text) TO service_role;

-- ── upsert: server-authoritative create-or-return ────────────────────────
CREATE OR REPLACE FUNCTION ops.upsert_workspace_event_archetype(
  p_workspace_id uuid,
  p_label text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_slug text;
  v_label_trimmed text;
  v_existing record;
  v_inserted record;
  v_was_created boolean := false;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: not a workspace member' USING ERRCODE = '42501';
  END IF;

  v_label_trimmed := trim(coalesce(p_label, ''));
  IF length(v_label_trimmed) = 0 THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: label is required' USING ERRCODE = '22023';
  END IF;
  IF length(v_label_trimmed) > 80 THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: label too long (80 chars max)' USING ERRCODE = '22023';
  END IF;

  v_slug := ops.normalize_event_archetype_label(v_label_trimmed);
  IF length(v_slug) = 0 THEN
    RAISE EXCEPTION 'upsert_workspace_event_archetype: label normalized to empty slug' USING ERRCODE = '22023';
  END IF;

  -- System row wins — never shadow.
  SELECT id, slug, label, is_system INTO v_existing
  FROM ops.workspace_event_archetypes
  WHERE slug = v_slug AND is_system = true AND archived_at IS NULL
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', v_existing.id, 'slug', v_existing.slug, 'label', v_existing.label,
      'is_system', v_existing.is_system, 'was_created', false
    );
  END IF;

  -- Existing custom row.
  SELECT id, slug, label, is_system INTO v_existing
  FROM ops.workspace_event_archetypes
  WHERE slug = v_slug AND workspace_id = p_workspace_id AND archived_at IS NULL
  LIMIT 1;
  IF v_existing.id IS NOT NULL THEN
    RETURN jsonb_build_object(
      'id', v_existing.id, 'slug', v_existing.slug, 'label', v_existing.label,
      'is_system', v_existing.is_system, 'was_created', false
    );
  END IF;

  -- Insert; partial unique index covers race.
  INSERT INTO ops.workspace_event_archetypes (
    workspace_id, slug, label, is_system, created_by_user_id
  )
  VALUES (p_workspace_id, v_slug, v_label_trimmed, false, v_user_id)
  ON CONFLICT DO NOTHING
  RETURNING id, slug, label, is_system INTO v_inserted;

  IF v_inserted.id IS NOT NULL THEN
    v_was_created := true;
  ELSE
    SELECT id, slug, label, is_system INTO v_inserted
    FROM ops.workspace_event_archetypes
    WHERE slug = v_slug AND workspace_id = p_workspace_id AND archived_at IS NULL
    LIMIT 1;
  END IF;

  RETURN jsonb_build_object(
    'id', v_inserted.id, 'slug', v_inserted.slug, 'label', v_inserted.label,
    'is_system', v_inserted.is_system, 'was_created', v_was_created
  );
END;
$function$;

REVOKE ALL ON FUNCTION ops.upsert_workspace_event_archetype(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.upsert_workspace_event_archetype(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION ops.upsert_workspace_event_archetype(uuid, text) TO authenticated;

-- ── merge: move deals + events, then archive source ──────────────────────
CREATE OR REPLACE FUNCTION ops.merge_workspace_event_archetypes(
  p_workspace_id uuid,
  p_source_slug text,
  p_target_slug text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_source record;
  v_target record;
  v_moved int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: not authenticated' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id
      AND workspace_id = p_workspace_id
      AND role IN ('owner', 'admin')
  ) THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: admin required' USING ERRCODE = '42501';
  END IF;

  IF p_source_slug = p_target_slug THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: source and target are the same' USING ERRCODE = '22023';
  END IF;

  SELECT id, slug, label, is_system, archived_at INTO v_source
  FROM ops.workspace_event_archetypes
  WHERE slug = p_source_slug
    AND workspace_id = p_workspace_id
    AND is_system = false
  LIMIT 1;

  IF v_source.id IS NULL THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: source slug % not found as custom type', p_source_slug USING ERRCODE = 'P0001';
  END IF;

  SELECT id, slug, label, is_system, archived_at INTO v_target
  FROM ops.workspace_event_archetypes
  WHERE slug = p_target_slug
    AND (workspace_id = p_workspace_id OR is_system = true)
    AND archived_at IS NULL
  LIMIT 1;

  IF v_target.id IS NULL THEN
    RAISE EXCEPTION 'merge_workspace_event_archetypes: target slug % not found', p_target_slug USING ERRCODE = 'P0001';
  END IF;

  UPDATE public.deals
  SET event_archetype = v_target.slug, updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND event_archetype = v_source.slug;
  GET DIAGNOSTICS v_moved = ROW_COUNT;

  UPDATE ops.events
  SET event_archetype = v_target.slug, updated_at = now()
  WHERE workspace_id = p_workspace_id
    AND event_archetype = v_source.slug;

  UPDATE ops.workspace_event_archetypes
  SET archived_at = now(), updated_at = now()
  WHERE id = v_source.id;

  RETURN jsonb_build_object(
    'moved_deals', v_moved,
    'source_slug', v_source.slug,
    'target_slug', v_target.slug
  );
END;
$function$;

REVOKE ALL ON FUNCTION ops.merge_workspace_event_archetypes(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.merge_workspace_event_archetypes(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION ops.merge_workspace_event_archetypes(uuid, text, text) TO authenticated;

-- ── archive / unarchive / rename — admin only ────────────────────────────
CREATE OR REPLACE FUNCTION ops.archive_workspace_event_archetype(p_workspace_id uuid, p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  UPDATE ops.workspace_event_archetypes
  SET archived_at = now(), updated_at = now()
  WHERE slug = p_slug AND workspace_id = p_workspace_id AND is_system = false;
END;
$function$;

CREATE OR REPLACE FUNCTION ops.unarchive_workspace_event_archetype(p_workspace_id uuid, p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  UPDATE ops.workspace_event_archetypes
  SET archived_at = NULL, updated_at = now()
  WHERE slug = p_slug AND workspace_id = p_workspace_id AND is_system = false;
END;
$function$;

CREATE OR REPLACE FUNCTION ops.rename_workspace_event_archetype(
  p_workspace_id uuid,
  p_slug text,
  p_new_label text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_user_id uuid;
  v_label text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'not authenticated' USING ERRCODE = '42501'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id AND role IN ('owner','admin')
  ) THEN
    RAISE EXCEPTION 'admin required' USING ERRCODE = '42501';
  END IF;
  v_label := trim(coalesce(p_new_label, ''));
  IF length(v_label) = 0 OR length(v_label) > 80 THEN
    RAISE EXCEPTION 'label must be 1–80 chars' USING ERRCODE = '22023';
  END IF;
  UPDATE ops.workspace_event_archetypes
  SET label = v_label, updated_at = now()
  WHERE slug = p_slug AND workspace_id = p_workspace_id AND is_system = false;
END;
$function$;

REVOKE ALL ON FUNCTION ops.archive_workspace_event_archetype(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.archive_workspace_event_archetype(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION ops.archive_workspace_event_archetype(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION ops.unarchive_workspace_event_archetype(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.unarchive_workspace_event_archetype(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION ops.unarchive_workspace_event_archetype(uuid, text) TO authenticated;

REVOKE ALL ON FUNCTION ops.rename_workspace_event_archetype(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.rename_workspace_event_archetype(uuid, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION ops.rename_workspace_event_archetype(uuid, text, text) TO authenticated;
