-- Move a note between the profile and its show, by hand, permanently.
--
-- A classifier that cannot be corrected rots the profile. The correction that
-- matters most is the one nobody thinks to build: promoting a note OUT of show
-- notes. The two error directions are not symmetric -- a logistics note left on
-- the profile is visible noise that gets fixed in a tap, while a judgement
-- wrongly demoted is invisible, and the profile quietly stops telling the truth
-- with nobody the wiser. So both directions get a control, and the promoting one
-- is the point.
--
-- Setting a scope by hand pins it. The classifier must never move a note a
-- person placed -- if a correction can be undone by the next parse, corrections
-- stop being made.
--
-- Authorship follows cortex.reassign_capture: only the person who captured a
-- note may re-file it. Whether re-filing a workspace-visible note should instead
-- be open to any member is a real question, left as it is rather than diverged
-- from quietly.

CREATE OR REPLACE FUNCTION cortex.set_capture_note_scope(
  p_capture_id uuid,
  p_note_scope text
) RETURNS boolean
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'cortex', 'public'
  AS $$
DECLARE
  v_user_id    uuid := auth.uid();
  v_workspace  uuid;
  v_owner_user uuid;
  v_has_link   boolean;
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  -- NULL is allowed: it returns the note to unclassified, which renders on the
  -- profile. Anything else is a value we cannot honour.
  IF p_note_scope IS NOT NULL AND p_note_scope NOT IN ('about', 'show') THEN
    RETURN FALSE;
  END IF;

  SELECT workspace_id, user_id,
         (linked_deal_id IS NOT NULL OR linked_event_id IS NOT NULL)
    INTO v_workspace, v_owner_user, v_has_link
    FROM cortex.capture_events WHERE id = p_capture_id;
  IF v_workspace IS NULL THEN RETURN FALSE; END IF;

  IF v_owner_user <> v_user_id THEN RETURN FALSE; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = v_workspace
  ) THEN RETURN FALSE; END IF;

  -- "true for that one show only" is meaningless with no show attached.
  IF p_note_scope = 'show' AND NOT v_has_link THEN RETURN FALSE; END IF;

  UPDATE cortex.capture_events
    SET note_scope = p_note_scope,
        note_scope_pinned = TRUE
    WHERE id = p_capture_id;

  RETURN TRUE;
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. A CREATE OR REPLACE
-- inherits production's ACL and hides that, leaving a fresh database with this
-- callable by anon, so the grants are stated rather than assumed.
REVOKE ALL ON FUNCTION cortex.set_capture_note_scope(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION cortex.set_capture_note_scope(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION cortex.set_capture_note_scope(uuid, text) TO authenticated, service_role;

DO $$
BEGIN
  IF has_function_privilege('anon', 'cortex.set_capture_note_scope(uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'set_capture_note_scope is executable by anon';
  END IF;
END $$;
