-- Private notes about a contact, restored.
--
-- They used to live in `public.org_private_data`, keyed
-- (owner_org_id, subject_org_id). That table does not exist -- the read
-- returned nothing and the write answered 404 -- so an owner typing notes about
-- a client on the deal page watched them disappear behind a generic failure.
-- The audit left the write refusing in plain words rather than pretending; this
-- gives it somewhere to go.
--
-- `directory.entity_working_notes` is that somewhere. It is already keyed
-- (workspace_id, entity_id), already SELECT-only with writes through this
-- SECURITY DEFINER RPC, and already holds the other three things a workspace
-- privately knows about a contact. A note is the fourth.
--
-- Deliberately NOT `directory.entities.attributes`: those travel with the
-- entity. A ghost org can be claimed, and a claimed org is readable by the
-- workspace that claims it -- so notes one workspace keeps about another party
-- would become visible to that party. The old table's whole point was that the
-- notes belong to the observer, not the observed, and this table keeps that.
--
-- `internal_rating` does not come back. Its only interface was the Private
-- notes tab in `EntitySheet`, which nothing renders, and a 1-5 number nobody
-- had defined the meaning of is worse than no field.

ALTER TABLE directory.entity_working_notes
  ADD COLUMN IF NOT EXISTS private_notes text;

COMMENT ON COLUMN directory.entity_working_notes.private_notes IS
  'Free-text notes this workspace keeps about the entity. Never shown to them.';

-- A defaulted parameter added to an existing function creates an OVERLOAD, not
-- a replacement -- `CREATE OR REPLACE` only matches on the full argument list.
-- Two versions would then be ambiguous to every named-argument caller. Drop
-- first. Dropping also discards the ACL, which is why the grants below are not
-- optional.
DROP FUNCTION IF EXISTS directory.upsert_entity_working_notes(
  uuid, uuid, text, boolean, text, text, text, text
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
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'directory', 'public'
AS $function$
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

  -- A capture may not write a private note. The other three fields are
  -- observations Aion can defensibly draw from a transcript; this one is the
  -- owner's own words about somebody, and a machine filling it in is the exact
  -- shape of the grounding defect that got the generated brief deleted.
  IF p_source = 'capture' AND p_private_notes IS NOT NULL THEN
    RETURN FALSE;
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
    private_notes,
    updated_at, updated_by,
    auto_filled_fields
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
    private_notes = CASE
      WHEN p_private_notes IS NULL THEN directory.entity_working_notes.private_notes
      WHEN p_private_notes = ''    THEN NULL
      ELSE p_private_notes
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
$function$;

REVOKE ALL ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text) FROM anon;
GRANT EXECUTE ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION directory.upsert_entity_working_notes(uuid, uuid, text, boolean, text, text, text, text, text) TO service_role;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='directory' AND table_name='entity_working_notes'
      AND column_name='private_notes'
  ) THEN
    RAISE EXCEPTION 'private_notes was not added';
  END IF;

  -- Exactly one version of the function, or every named-argument call is ambiguous.
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
      WHERE n.nspname='directory' AND p.proname='upsert_entity_working_notes') <> 1 THEN
    RAISE EXCEPTION 'upsert_entity_working_notes is overloaded';
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
