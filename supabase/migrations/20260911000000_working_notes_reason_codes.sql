-- A boolean that meant seven different things.
--
-- `upsert_entity_working_notes` returned FALSE for: not signed in, an
-- unrecognised source, not a member of the workspace, an entity belonging to a
-- different workspace, an invalid do-not-rebook reason, an invalid preferred
-- channel, and a capture trying to write a private note. The caller collapsed
-- all seven into one sentence -- "Write refused — workspace mismatch or
-- invalid value."
--
-- A write that fails for a reason nobody can name is the undiagnosable-write
-- problem the schema audit existed to end, and it was sitting inside the
-- audit's own fix.
--
-- It returns `{"ok": true}` or `{"ok": false, "error": "<code>"}` now, matching
-- `set_workspace_label_pack` and `create_workspace_with_owner`. The code is the
-- database's; the wording is the app's, in
-- `src/widgets/network-detail/model/working-notes-errors.ts`, because copy
-- belongs where the voice guide is and not in a migration.
--
-- A return-type change cannot go through CREATE OR REPLACE, so the function is
-- dropped first -- which also discards its ACL, hence the grants below.

DROP FUNCTION IF EXISTS directory.upsert_entity_working_notes(
  uuid, uuid, text, boolean, text, text, text, text, text
);

CREATE FUNCTION directory.upsert_entity_working_notes(
  p_workspace_id uuid,
  p_entity_id uuid,
  p_communication_style text DEFAULT NULL,
  p_dnr_flagged boolean DEFAULT NULL,
  p_dnr_reason text DEFAULT NULL,
  p_dnr_note text DEFAULT NULL,
  p_preferred_channel text DEFAULT NULL,
  p_private_notes text DEFAULT NULL,
  p_source text DEFAULT 'manual'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'directory', 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_written_fields text[] := '{}';
BEGIN
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_authenticated');
  END IF;
  IF p_source NOT IN ('manual', 'capture') THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_source');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'not_a_member');
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_entity_id AND owner_workspace_id = p_workspace_id
  ) THEN
    RETURN jsonb_build_object('ok', false, 'error', 'entity_not_in_workspace');
  END IF;

  IF p_dnr_reason IS NOT NULL
     AND p_dnr_reason NOT IN ('paid_late', 'unreliable', 'abuse', 'contractual', 'other', '')
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_dnr_reason');
  END IF;
  IF p_preferred_channel IS NOT NULL
     AND p_preferred_channel NOT IN ('call', 'email', 'sms', '')
  THEN
    RETURN jsonb_build_object('ok', false, 'error', 'invalid_preferred_channel');
  END IF;

  -- A capture may not write a private note. The other three fields are
  -- observations Aion can defensibly draw from a transcript; this one is the
  -- owner's own words about somebody.
  IF p_source = 'capture' AND p_private_notes IS NOT NULL THEN
    RETURN jsonb_build_object('ok', false, 'error', 'capture_cannot_write_private_note');
  END IF;

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
    private_notes, updated_at, updated_by, auto_filled_fields
  ) VALUES (
    p_workspace_id, p_entity_id,
    NULLIF(p_communication_style, ''),
    COALESCE(p_dnr_flagged, false),
    NULLIF(p_dnr_reason, ''),
    NULLIF(p_dnr_note, ''),
    NULLIF(p_preferred_channel, ''),
    NULLIF(p_private_notes, ''),
    now(), v_user_id,
    CASE WHEN p_source = 'capture' THEN v_written_fields ELSE '{}'::text[] END
  )
  ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
    communication_style = CASE
      WHEN p_communication_style IS NULL THEN directory.entity_working_notes.communication_style
      WHEN p_communication_style = ''    THEN NULL
      ELSE p_communication_style END,
    dnr_flagged = COALESCE(p_dnr_flagged, directory.entity_working_notes.dnr_flagged),
    dnr_reason = CASE
      WHEN p_dnr_reason IS NULL THEN directory.entity_working_notes.dnr_reason
      WHEN p_dnr_reason = ''    THEN NULL
      ELSE p_dnr_reason END,
    dnr_note = CASE
      WHEN p_dnr_note IS NULL THEN directory.entity_working_notes.dnr_note
      WHEN p_dnr_note = ''    THEN NULL
      ELSE p_dnr_note END,
    preferred_channel = CASE
      WHEN p_preferred_channel IS NULL THEN directory.entity_working_notes.preferred_channel
      WHEN p_preferred_channel = ''    THEN NULL
      ELSE p_preferred_channel END,
    private_notes = CASE
      WHEN p_private_notes IS NULL THEN directory.entity_working_notes.private_notes
      WHEN p_private_notes = ''    THEN NULL
      ELSE p_private_notes END,
    updated_at = now(),
    updated_by = v_user_id,
    auto_filled_fields = CASE
      WHEN p_source = 'capture' THEN
        ARRAY(SELECT DISTINCT unnest(directory.entity_working_notes.auto_filled_fields || v_written_fields))
      ELSE
        ARRAY(SELECT x FROM unnest(directory.entity_working_notes.auto_filled_fields) AS x
              WHERE x <> ALL(v_written_fields))
    END;

  RETURN jsonb_build_object('ok', true);
END;
$function$;

REVOKE ALL ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text) TO service_role;

DO $$
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='directory' AND p.proname='upsert_entity_working_notes') <> 1 THEN
    RAISE EXCEPTION 'upsert_entity_working_notes is overloaded';
  END IF;
  IF (SELECT pg_get_function_result(p.oid) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='directory' AND p.proname='upsert_entity_working_notes') <> 'jsonb' THEN
    RAISE EXCEPTION 'upsert_entity_working_notes does not return jsonb';
  END IF;
  IF has_function_privilege('anon',
      'directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'anon can execute upsert_entity_working_notes';
  END IF;
  IF NOT has_function_privilege('authenticated',
      'directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'authenticated cannot execute upsert_entity_working_notes';
  END IF;
END $$;
