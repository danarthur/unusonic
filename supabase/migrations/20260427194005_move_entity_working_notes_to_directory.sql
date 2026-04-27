-- Move 2 of 3 (cortex scope-creep cleanup, Wk 16) — entity_working_notes → directory.
--
-- entity_working_notes annotates directory.entities with per-entity workflow
-- metadata (communication_style, dnr_flagged, preferred_channel). It belongs
-- in directory alongside the entities it describes, not in cortex.

ALTER TABLE cortex.entity_working_notes SET SCHEMA directory;

CREATE OR REPLACE FUNCTION directory.upsert_entity_working_notes(
  p_workspace_id uuid,
  p_entity_id uuid,
  p_communication_style text DEFAULT NULL,
  p_dnr_flagged boolean DEFAULT NULL,
  p_dnr_reason text DEFAULT NULL,
  p_dnr_note text DEFAULT NULL,
  p_preferred_channel text DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'directory', 'public'
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_written_fields text[] := '{}';
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;
  IF p_source NOT IN ('manual', 'capture') THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_entity_id AND owner_workspace_id = p_workspace_id
  ) THEN RETURN FALSE; END IF;

  IF p_dnr_reason IS NOT NULL
     AND p_dnr_reason NOT IN ('paid_late', 'unreliable', 'abuse', 'contractual', 'other', '')
  THEN RETURN FALSE; END IF;
  IF p_preferred_channel IS NOT NULL
     AND p_preferred_channel NOT IN ('call', 'email', 'sms', '')
  THEN RETURN FALSE; END IF;

  -- Which fields does this write touch? Field names we track for source.
  IF p_communication_style IS NOT NULL THEN
    v_written_fields := array_append(v_written_fields, 'communication_style');
  END IF;
  IF p_dnr_flagged IS NOT NULL OR p_dnr_reason IS NOT NULL OR p_dnr_note IS NOT NULL THEN
    v_written_fields := array_append(v_written_fields, 'dnr');
  END IF;
  IF p_preferred_channel IS NOT NULL THEN
    v_written_fields := array_append(v_written_fields, 'preferred_channel');
  END IF;

  INSERT INTO directory.entity_working_notes (
    workspace_id, entity_id,
    communication_style, dnr_flagged, dnr_reason, dnr_note, preferred_channel,
    updated_at, updated_by,
    auto_filled_fields
  ) VALUES (
    p_workspace_id, p_entity_id,
    NULLIF(p_communication_style, ''),
    COALESCE(p_dnr_flagged, false),
    NULLIF(p_dnr_reason, ''),
    NULLIF(p_dnr_note, ''),
    NULLIF(p_preferred_channel, ''),
    now(), v_user_id,
    CASE WHEN p_source = 'capture' THEN v_written_fields ELSE '{}'::text[] END
  )
  ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
    communication_style = CASE
      WHEN p_communication_style IS NULL THEN directory.entity_working_notes.communication_style
      WHEN p_communication_style = ''    THEN NULL
      ELSE p_communication_style
    END,
    dnr_flagged = COALESCE(p_dnr_flagged, directory.entity_working_notes.dnr_flagged),
    dnr_reason = CASE
      WHEN p_dnr_reason IS NULL THEN directory.entity_working_notes.dnr_reason
      WHEN p_dnr_reason = ''    THEN NULL
      ELSE p_dnr_reason
    END,
    dnr_note = CASE
      WHEN p_dnr_note IS NULL THEN directory.entity_working_notes.dnr_note
      WHEN p_dnr_note = ''    THEN NULL
      ELSE p_dnr_note
    END,
    preferred_channel = CASE
      WHEN p_preferred_channel IS NULL THEN directory.entity_working_notes.preferred_channel
      WHEN p_preferred_channel = ''    THEN NULL
      ELSE p_preferred_channel
    END,
    updated_at = now(),
    updated_by = v_user_id,
    auto_filled_fields = CASE
      WHEN p_source = 'capture' THEN
        ARRAY(
          SELECT DISTINCT unnest(directory.entity_working_notes.auto_filled_fields || v_written_fields)
        )
      ELSE
        ARRAY(
          SELECT x FROM unnest(directory.entity_working_notes.auto_filled_fields) AS x
          WHERE x <> ALL(v_written_fields)
        )
    END;

  RETURN TRUE;
END;
$$;

DROP FUNCTION cortex.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text);

REVOKE EXECUTE ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text) FROM anon;
GRANT  EXECUTE ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'Security regression: anon has EXECUTE on directory.upsert_entity_working_notes';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'directory' AND c.relname = 'entity_working_notes') THEN
    RAISE EXCEPTION 'Schema move failed: directory.entity_working_notes does not exist';
  END IF;
  IF EXISTS (SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'cortex' AND c.relname = 'entity_working_notes') THEN
    RAISE EXCEPTION 'Schema move failed: cortex.entity_working_notes still exists';
  END IF;
END $$;
