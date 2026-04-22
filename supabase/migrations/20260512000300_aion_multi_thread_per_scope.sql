-- =============================================================================
-- Aion Deal Chat — multi-thread-per-scope pivot
--
-- Design: docs/reference/aion-deal-chat-design.md + 2026-04-21 second design
-- pass (ChatGPT / Claude Projects pattern). A single production (deal) now
-- holds many chat threads, each with its own topic and auto-generated title.
--
-- Migrates from the single-session-per-(user, deal) contract introduced in
-- 20260512000100 to the multi-thread model. Zero data loss: existing deal
-- sessions simply become the first thread under their production.
--
-- Changes:
--   1. Drop the partial unique index `aion_sessions_scope_unique_active` —
--      uniqueness per scope is gone. Users can have many chats per deal.
--   2. Add four columns: is_pinned, pinned_at, title_locked, last_message_at.
--   3. Backfill last_message_at from updated_at on existing rows.
--   4. Replace the sidebar index with a multi-thread-aware compound index
--      and add a partial index for pinned rendering.
--   5. Update resume_or_create_aion_session to ORDER BY last_message_at DESC
--      so the mount-resume path returns the most-recently-touched thread.
--   6. Update save_aion_message to bump last_message_at alongside updated_at.
--   7. Add RPCs: create_new_aion_session_for_scope (explicit "New chat"),
--      set_aion_session_title (user rename + async title generation),
--      pin_aion_session / unpin_aion_session (3-per-scope cap enforced).
-- =============================================================================

-- ---------------------------------------------------------------------------
-- 1. Drop the uniqueness constraint
-- ---------------------------------------------------------------------------

DROP INDEX IF EXISTS cortex.aion_sessions_scope_unique_active;

-- ---------------------------------------------------------------------------
-- 2. Add multi-thread support columns
-- ---------------------------------------------------------------------------

ALTER TABLE cortex.aion_sessions
  ADD COLUMN IF NOT EXISTS is_pinned       boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS pinned_at       timestamptz,
  ADD COLUMN IF NOT EXISTS title_locked    boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS last_message_at timestamptz;

-- 3. Backfill last_message_at from updated_at for existing rows.
UPDATE cortex.aion_sessions
   SET last_message_at = updated_at
 WHERE last_message_at IS NULL;

-- Lock NOT NULL now that the backfill is complete.
ALTER TABLE cortex.aion_sessions
  ALTER COLUMN last_message_at SET NOT NULL,
  ALTER COLUMN last_message_at SET DEFAULT now();

-- Pin consistency: pinned_at must be set iff is_pinned is true.
ALTER TABLE cortex.aion_sessions
  ADD CONSTRAINT aion_sessions_pin_consistency CHECK (
    (is_pinned = true  AND pinned_at IS NOT NULL)
    OR
    (is_pinned = false AND pinned_at IS NULL)
  );

-- ---------------------------------------------------------------------------
-- 4. Index pivot
-- ---------------------------------------------------------------------------

-- Drop the old sidebar index — the shape changed.
DROP INDEX IF EXISTS cortex.aion_sessions_sidebar;

-- Compound index for the 3-level sidebar query:
--   WHERE user_id = ? AND workspace_id = ? AND archived_at IS NULL
--   ORDER BY scope_entity_id, last_message_at DESC
CREATE INDEX IF NOT EXISTS aion_sessions_sidebar_v2
  ON cortex.aion_sessions (user_id, workspace_id, scope_entity_id, archived_at, last_message_at DESC);

-- Partial index for pinned threads (small set, capped at 3 per scope).
CREATE INDEX IF NOT EXISTS aion_sessions_pinned
  ON cortex.aion_sessions (user_id, workspace_id, scope_entity_id, pinned_at DESC)
  WHERE is_pinned = true AND archived_at IS NULL;

-- ---------------------------------------------------------------------------
-- 5. Update resume_or_create_aion_session to return the most-recent thread.
--    Without the unique index, LIMIT 1 becomes non-deterministic if a user
--    has multiple threads for the same scope — explicit ORDER BY fixes that.
--    This is the function the deal-card mount path calls.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.resume_or_create_aion_session(
  p_workspace_id     uuid,
  p_scope_type       text,
  p_scope_entity_id  uuid DEFAULT NULL,
  p_title            text DEFAULT NULL
)
RETURNS TABLE (session_id uuid, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cortex, public, ops
AS $$
DECLARE
  v_user_id    uuid;
  v_session_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id
       AND user_id      = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_scope_type = 'general' AND p_scope_entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'general-scope sessions must not have a scope_entity_id'
      USING ERRCODE = '22023';
  END IF;
  IF p_scope_type IN ('deal', 'event') AND p_scope_entity_id IS NULL THEN
    RAISE EXCEPTION '%-scope sessions require a scope_entity_id', p_scope_type
      USING ERRCODE = '22023';
  END IF;

  IF p_scope_type = 'deal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.deals
       WHERE id           = p_scope_entity_id
         AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Deal not found in workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope_type = 'event' THEN
    RAISE EXCEPTION 'event-scoped sessions are not yet available'
      USING ERRCODE = '0A000';
  END IF;

  -- Resume the most-recently-touched non-archived thread for this scope.
  -- Multi-thread model: there may be many — pick the freshest.
  SELECT id INTO v_session_id
    FROM cortex.aion_sessions
   WHERE user_id         = v_user_id
     AND workspace_id    = p_workspace_id
     AND scope_type      = p_scope_type
     AND scope_entity_id IS NOT DISTINCT FROM p_scope_entity_id
     AND archived_at     IS NULL
   ORDER BY last_message_at DESC
   LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    RETURN QUERY SELECT v_session_id, false;
    RETURN;
  END IF;

  INSERT INTO cortex.aion_sessions (
    workspace_id, user_id, scope_type, scope_entity_id, title
  )
  VALUES (
    p_workspace_id, v_user_id, p_scope_type, p_scope_entity_id, p_title
  )
  RETURNING id INTO v_session_id;

  RETURN QUERY SELECT v_session_id, true;
END;
$$;

-- ---------------------------------------------------------------------------
-- 6. Update save_aion_message to bump last_message_at.
--    Existing function bumped updated_at only; last_message_at needs to track
--    message-save events independently so UI sorts don't shuffle when a
--    non-message field (title, pin) updates the row.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.save_aion_message(
  p_session_id         uuid,
  p_role               text,
  p_content            text,
  p_structured_content jsonb DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO cortex.aion_messages (session_id, role, content, structured_content)
  VALUES (p_session_id, p_role, p_content, p_structured_content)
  RETURNING id INTO v_id;

  UPDATE cortex.aion_sessions
     SET updated_at      = now(),
         last_message_at = now()
   WHERE id = p_session_id;

  RETURN v_id;
END;
$$;

-- ---------------------------------------------------------------------------
-- 7. New RPC: create_new_aion_session_for_scope
--    Always-creates path used by the "New chat" button. Unlike
--    resume_or_create_aion_session, this never returns an existing row.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.create_new_aion_session_for_scope(
  p_workspace_id     uuid,
  p_scope_type       text,
  p_scope_entity_id  uuid DEFAULT NULL,
  p_title            text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cortex, public, ops
AS $$
DECLARE
  v_user_id    uuid;
  v_session_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id
       AND user_id      = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_scope_type = 'general' AND p_scope_entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'general-scope sessions must not have a scope_entity_id'
      USING ERRCODE = '22023';
  END IF;
  IF p_scope_type IN ('deal', 'event') AND p_scope_entity_id IS NULL THEN
    RAISE EXCEPTION '%-scope sessions require a scope_entity_id', p_scope_type
      USING ERRCODE = '22023';
  END IF;

  IF p_scope_type = 'deal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.deals
       WHERE id           = p_scope_entity_id
         AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Deal not found in workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope_type = 'event' THEN
    RAISE EXCEPTION 'event-scoped sessions are not yet available'
      USING ERRCODE = '0A000';
  END IF;

  INSERT INTO cortex.aion_sessions (
    workspace_id, user_id, scope_type, scope_entity_id, title
  )
  VALUES (
    p_workspace_id, v_user_id, p_scope_type, p_scope_entity_id, p_title
  )
  RETURNING id INTO v_session_id;

  RETURN v_session_id;
END;
$$;

COMMENT ON FUNCTION cortex.create_new_aion_session_for_scope(uuid, text, uuid, text) IS
  'Always-creates Aion session for the given scope — never resumes. Used by the "New chat" button in the deal card + sidebar. SECURITY DEFINER: workspace + scope entity validated.';

REVOKE ALL ON FUNCTION cortex.create_new_aion_session_for_scope(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.create_new_aion_session_for_scope(uuid, text, uuid, text)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 8. New RPC: set_aion_session_title
--    User rename → title_locked=true (never auto-regenerates again).
--    Async title-generator call (post first-turn) → title_locked stays false.
--    Caller signals intent via the p_lock parameter.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.set_aion_session_title(
  p_session_id uuid,
  p_title      text,
  p_lock       boolean DEFAULT false
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cortex, public
AS $$
DECLARE
  v_user_id uuid;
  v_locked  boolean;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Read current lock state to enforce title-generator deference.
  SELECT title_locked INTO v_locked
    FROM cortex.aion_sessions
   WHERE id      = p_session_id
     AND user_id = v_user_id;

  IF v_locked IS NULL THEN
    RAISE EXCEPTION 'Session not found or not owned by caller'
      USING ERRCODE = '42501';
  END IF;

  -- If title is locked AND caller isn't setting p_lock (i.e. title generator
  -- retrying), refuse. User-initiated renames always win (pass p_lock=true).
  IF v_locked = true AND p_lock = false THEN
    -- Silent no-op: title-generator attempting to overwrite a user rename.
    -- Do not raise — the generator is fire-and-forget and we want it idempotent.
    RETURN;
  END IF;

  UPDATE cortex.aion_sessions
     SET title        = p_title,
         title_locked = CASE WHEN p_lock = true THEN true ELSE title_locked END,
         updated_at   = now()
   WHERE id      = p_session_id
     AND user_id = v_user_id;
END;
$$;

COMMENT ON FUNCTION cortex.set_aion_session_title(uuid, text, boolean) IS
  'Rename an Aion session. p_lock=true marks the title as user-set (generator will never overwrite). Auto-generator calls with p_lock=false and silently no-ops against locked titles.';

REVOKE ALL ON FUNCTION cortex.set_aion_session_title(uuid, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.set_aion_session_title(uuid, text, boolean)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 9. New RPCs: pin_aion_session / unpin_aion_session
--    Cap at 3 pinned threads per (user, scope). Attempting a 4th raises.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION cortex.pin_aion_session(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cortex, public
AS $$
DECLARE
  v_user_id         uuid;
  v_workspace_id    uuid;
  v_scope_type      text;
  v_scope_entity_id uuid;
  v_pinned_count    int;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Read session + scope in one query. If not found / not owned, error.
  SELECT workspace_id, scope_type, scope_entity_id
    INTO v_workspace_id, v_scope_type, v_scope_entity_id
    FROM cortex.aion_sessions
   WHERE id          = p_session_id
     AND user_id     = v_user_id
     AND archived_at IS NULL;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Session not found or not owned by caller'
      USING ERRCODE = '42501';
  END IF;

  -- Enforce the 3-per-scope cap. Scope is the (workspace, scope_type,
  -- scope_entity_id) triple — general sessions share one pin bucket.
  SELECT count(*) INTO v_pinned_count
    FROM cortex.aion_sessions
   WHERE user_id         = v_user_id
     AND workspace_id    = v_workspace_id
     AND scope_type      = v_scope_type
     AND scope_entity_id IS NOT DISTINCT FROM v_scope_entity_id
     AND is_pinned       = true
     AND archived_at     IS NULL
     AND id              <> p_session_id;

  IF v_pinned_count >= 3 THEN
    RAISE EXCEPTION 'Pin cap reached: unpin an existing thread first (max 3 per scope)'
      USING ERRCODE = '23505';
  END IF;

  UPDATE cortex.aion_sessions
     SET is_pinned  = true,
         pinned_at  = now(),
         updated_at = now()
   WHERE id = p_session_id;
END;
$$;

COMMENT ON FUNCTION cortex.pin_aion_session(uuid) IS
  'Pin an Aion session to the top of its scope in the sidebar. Caps at 3 pins per (user, scope) — the intentional constraint from ChatGPT Projects that prevents pin-list sprawl.';

REVOKE ALL ON FUNCTION cortex.pin_aion_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.pin_aion_session(uuid)
  TO authenticated, service_role;


CREATE OR REPLACE FUNCTION cortex.unpin_aion_session(
  p_session_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cortex, public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_sessions
     SET is_pinned  = false,
         pinned_at  = NULL,
         updated_at = now()
   WHERE id      = p_session_id
     AND user_id = v_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not owned by caller'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION cortex.unpin_aion_session(uuid) IS
  'Unpin an Aion session.';

REVOKE ALL ON FUNCTION cortex.unpin_aion_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.unpin_aion_session(uuid)
  TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 10. Post-deploy sanity checks (run manually in SQL Editor)
-- ---------------------------------------------------------------------------
--
--   -- Confirm the old unique index is gone
--   SELECT indexname FROM pg_indexes
--    WHERE schemaname = 'cortex' AND tablename = 'aion_sessions';
--   -- Expected: aion_sessions_pkey, aion_sessions_sidebar_v2,
--   --           aion_sessions_pinned, aion_sessions_scope_entity, (others)
--   --           NOT aion_sessions_scope_unique_active
--
--   -- Confirm new columns present
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'cortex' AND table_name = 'aion_sessions'
--      AND column_name IN ('is_pinned', 'pinned_at', 'title_locked', 'last_message_at');
--   -- Expected: all four
--
--   -- Confirm all new RPCs have anon locked out
--   SELECT proname, has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_exec
--   FROM pg_proc p
--   WHERE pronamespace = 'cortex'::regnamespace
--     AND proname IN ('create_new_aion_session_for_scope', 'set_aion_session_title',
--                     'pin_aion_session', 'unpin_aion_session');
--   -- Expected: anon_exec = false for all four
