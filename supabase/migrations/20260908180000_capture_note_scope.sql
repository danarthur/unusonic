-- Notes: separate what belongs on a profile from what belongs to one show.
--
-- The entity timeline shows every capture ever filed against an entity in one
-- flat list, so "Brandi always pays on time" sits at equal weight with "Brandi
-- wants the ceremony at 5 not 4:30 for the Hale wedding". The second is noise
-- on a profile opened six months later to decide whether to work with her again.
--
-- Filtering on linked_deal_id alone does not work. "Showed up two hours late"
-- is attached to one show AND is a standing fact about the person. Scope and
-- usefulness-next-time are different questions, and only the first is currently
-- recorded. This adds the second.
--
--   note_scope IS NULL  -- unclassified. Renders on the profile.
--   'about'             -- changes what happens next time. Profile.
--   'show'              -- true for that show only. Demoted, never hidden.
--
-- NULL is the default on purpose: every existing row keeps rendering exactly
-- where it does today, and nothing is moved out of sight by a backfill. The
-- error directions are not symmetric -- a logistics note left on the profile is
-- visible noise that gets fixed in a tap, while a judgement wrongly demoted is
-- invisible and the profile quietly stops telling the truth. So when in doubt,
-- the note stays on the profile.

BEGIN;

ALTER TABLE cortex.capture_events
  ADD COLUMN IF NOT EXISTS note_scope text
    CONSTRAINT capture_events_note_scope_check
    CHECK (note_scope IN ('about', 'show'));

-- Manual placement outranks the model, permanently. If a note is moved by hand
-- and a later classification moves it back, the feature is finished -- so the
-- classifier must never write to a row where this is true.
ALTER TABLE cortex.capture_events
  ADD COLUMN IF NOT EXISTS note_scope_pinned boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN cortex.capture_events.note_scope IS
  'about | show | NULL. NULL means unclassified and renders on the profile — never demote on a guess.';
COMMENT ON COLUMN cortex.capture_events.note_scope_pinned IS
  'Set when a human placed this note. The classifier must not overwrite note_scope while true.';

-- Reading the entity timeline filters on (resolved_entity_id, note_scope), and
-- the counted "Show notes" section needs the same predicate.
CREATE INDEX IF NOT EXISTS capture_events_entity_scope_idx
  ON cortex.capture_events (resolved_entity_id, note_scope)
  WHERE status = 'confirmed';

-- ── write_capture_confirmed: carry the classification through ────────────────
--
-- Dropped and recreated rather than given a defaulted parameter. Adding a
-- DEFAULT argument creates a second overload rather than replacing the
-- function, and the old one keeps being resolvable -- the same trap that left a
-- stale 7-argument log_referral callable earlier in this work.

DROP FUNCTION IF EXISTS cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text, text, uuid, uuid
);

CREATE FUNCTION cortex.write_capture_confirmed(
  p_workspace_id uuid,
  p_transcript text,
  p_parsed_entity jsonb DEFAULT NULL::jsonb,
  p_parsed_follow_up jsonb DEFAULT NULL::jsonb,
  p_parsed_note text DEFAULT NULL::text,
  p_resolved_entity_id uuid DEFAULT NULL::uuid,
  p_created_follow_up_queue_id uuid DEFAULT NULL::uuid,
  p_audio_storage_path text DEFAULT NULL::text,
  p_visibility text DEFAULT 'user'::text,
  p_linked_deal_id uuid DEFAULT NULL::uuid,
  p_linked_event_id uuid DEFAULT NULL::uuid,
  p_note_scope text DEFAULT NULL::text
) RETURNS uuid
  LANGUAGE plpgsql SECURITY DEFINER
  SET search_path TO 'cortex', 'public'
  AS $$
DECLARE
  v_id      uuid;
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN NULL; END IF;
  IF p_visibility NOT IN ('user', 'workspace') THEN RETURN NULL; END IF;

  -- An unrecognised scope is treated as unclassified rather than rejected: a
  -- capture is never worth losing over a classification we could not read.
  IF p_note_scope IS NOT NULL AND p_note_scope NOT IN ('about', 'show') THEN
    p_note_scope := NULL;
  END IF;

  -- A note can belong to a deal or an event, not both.
  IF p_linked_deal_id IS NOT NULL AND p_linked_event_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- 'show' means "true for that one show only", which is meaningless with no
  -- show attached. Demote nothing on the strength of a dangling label.
  IF p_note_scope = 'show'
     AND p_linked_deal_id IS NULL
     AND p_linked_event_id IS NULL THEN
    p_note_scope := NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  IF p_linked_deal_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.deals
    WHERE id = p_linked_deal_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  IF p_linked_event_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM ops.events
    WHERE id = p_linked_event_id AND workspace_id = p_workspace_id
  ) THEN
    RETURN NULL;
  END IF;

  INSERT INTO cortex.capture_events (
    workspace_id, user_id, audio_storage_path, transcript,
    parsed_entity, parsed_follow_up, parsed_note,
    resolved_entity_id, created_follow_up_queue_id,
    status, confirmed_at, visibility,
    linked_deal_id, linked_event_id, note_scope
  ) VALUES (
    p_workspace_id, v_user_id, p_audio_storage_path, p_transcript,
    p_parsed_entity, p_parsed_follow_up, p_parsed_note,
    p_resolved_entity_id, p_created_follow_up_queue_id,
    'confirmed', now(), p_visibility,
    p_linked_deal_id, p_linked_event_id, p_note_scope
  )
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

-- CREATE FUNCTION grants EXECUTE to PUBLIC by default, which on a fresh database
-- leaves this callable by anon. A rewrite inherits production's ACL and hides
-- that, so the grants are stated outright rather than assumed.
REVOKE ALL ON FUNCTION cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text, text, uuid, uuid, text
) FROM PUBLIC;
REVOKE ALL ON FUNCTION cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text, text, uuid, uuid, text
) FROM anon;
GRANT EXECUTE ON FUNCTION cortex.write_capture_confirmed(
  uuid, text, jsonb, jsonb, text, uuid, uuid, text, text, uuid, uuid, text
) TO authenticated, service_role;

-- Fail the migration rather than ship a hole.
DO $$
BEGIN
  IF has_function_privilege('anon', 'cortex.write_capture_confirmed(uuid, text, jsonb, jsonb, text, uuid, uuid, text, text, uuid, uuid, text)', 'EXECUTE') THEN
    RAISE EXCEPTION 'write_capture_confirmed is executable by anon';
  END IF;
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'cortex'
      AND p.proname = 'write_capture_confirmed'
      AND p.pronargs = 11
  ) THEN
    RAISE EXCEPTION 'the 11-argument write_capture_confirmed overload still exists';
  END IF;
END $$;

COMMIT;
