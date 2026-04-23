-- =============================================================================
-- Aion Deal Chat — consolidate on cortex.aion_sessions + cortex.aion_messages
--
-- Context: migration 20260512000000_aion_threads introduced parallel
-- cortex.aion_threads + cortex.aion_thread_messages tables before noticing the
-- existing cortex.aion_sessions + cortex.aion_messages system already in use
-- by /api/aion/chat (rolling summaries, feedback, 90-day retention, full CRUD
-- wrapper in src/app/(dashboard)/(features)/aion/actions/aion-session-actions.ts).
--
-- This migration:
--   1. Drops the parallel thread tables and their RPCs (both empty — zero
--      data loss verified pre-migration).
--   2. Extends cortex.aion_sessions with the scope fields (scope_type,
--      scope_entity_id), pinned, archived_at + the resume-if-exists unique
--      partial index.
--   3. Extends cortex.aion_messages with context_fingerprint + the 'tool' role.
--   4. Adds two new RPCs: resume_or_create_aion_session (scope-aware wrapper
--      around the existing create_aion_session) and archive_aion_session
--      (soft delete). The existing delete_aion_session stays for hard delete.
--
-- Design spec: docs/reference/aion-deal-chat-design.md §7.
--
-- Security discipline (per feedback_postgres_function_grants memory note):
--   Every new RPC REVOKE ALL FROM PUBLIC, anon in this same migration.
-- =============================================================================

-- =============================================================================
-- 1. Revert — drop parallel thread tables and their RPCs
-- =============================================================================

DROP FUNCTION IF EXISTS cortex.archive_aion_thread(uuid);
DROP FUNCTION IF EXISTS cortex.append_aion_message(uuid, text, jsonb, text);
DROP FUNCTION IF EXISTS cortex.create_aion_thread(uuid, text, uuid, text);

DROP TABLE IF EXISTS cortex.aion_thread_messages;
DROP TABLE IF EXISTS cortex.aion_threads;

-- =============================================================================
-- 2. Extend cortex.aion_sessions with scope + pinning + soft-archive
-- =============================================================================

ALTER TABLE cortex.aion_sessions
  ADD COLUMN IF NOT EXISTS scope_type      text,
  ADD COLUMN IF NOT EXISTS scope_entity_id uuid,
  ADD COLUMN IF NOT EXISTS pinned          boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS archived_at     timestamptz;

-- Default any existing rows to general scope. Backfill runs once; new rows
-- from code must explicitly set scope_type (enforced by the CHECK below).
UPDATE cortex.aion_sessions SET scope_type = 'general' WHERE scope_type IS NULL;

-- Lock the column NOT NULL + add the CHECK now that backfill is complete.
ALTER TABLE cortex.aion_sessions
  ALTER COLUMN scope_type SET NOT NULL;

ALTER TABLE cortex.aion_sessions
  ADD CONSTRAINT aion_sessions_scope_type_check
    CHECK (scope_type IN ('general', 'deal', 'event'));

-- Scope consistency: general has no entity, deal/event require one.
ALTER TABLE cortex.aion_sessions
  ADD CONSTRAINT aion_sessions_scope_consistency
    CHECK (
      (scope_type = 'general' AND scope_entity_id IS NULL)
      OR (scope_type IN ('deal', 'event') AND scope_entity_id IS NOT NULL)
    );

-- Resume contract: at most one non-archived session per (user, workspace,
-- scope, entity). Opening the deal card and opening the Aion-tab deal
-- session both resolve to the same row. Archived rows are excluded so
-- explicit archival creates a fresh conversation next open.
CREATE UNIQUE INDEX IF NOT EXISTS aion_sessions_scope_unique_active
  ON cortex.aion_sessions (
    user_id,
    workspace_id,
    scope_type,
    COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid)
  )
  WHERE archived_at IS NULL;

-- Scope-entity lookup (e.g., "give me all sessions referencing this deal")
CREATE INDEX IF NOT EXISTS aion_sessions_scope_entity
  ON cortex.aion_sessions (scope_entity_id)
  WHERE scope_entity_id IS NOT NULL;

-- Sidebar sort: pinned first, then most-recent — matches the Aion-tab sidebar
-- grouping contract in docs/reference/aion-deal-chat-design.md §2.2.
-- The existing idx_aion_sessions_user covers the non-pinned case; this one
-- adds archived_at filtering.
CREATE INDEX IF NOT EXISTS aion_sessions_sidebar
  ON cortex.aion_sessions (user_id, workspace_id, archived_at, pinned DESC, updated_at DESC);

-- =============================================================================
-- 3. Extend cortex.aion_messages with staleness fingerprint + 'tool' role
-- =============================================================================

ALTER TABLE cortex.aion_messages
  ADD COLUMN IF NOT EXISTS context_fingerprint text;

-- Expand role CHECK to include 'tool' (Vercel AI SDK tool-result messages).
ALTER TABLE cortex.aion_messages
  DROP CONSTRAINT IF EXISTS aion_messages_role_check;
ALTER TABLE cortex.aion_messages
  ADD  CONSTRAINT aion_messages_role_check
    CHECK (role IN ('user', 'assistant', 'system', 'tool'));

-- =============================================================================
-- 4. RPC — resume_or_create_aion_session
--
-- Scope-aware wrapper around the existing create_aion_session. Implements the
-- resume-if-exists semantic: a deal-scoped session per (user, deal) returns
-- the existing row rather than duplicating.
-- =============================================================================

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

  -- Workspace membership check
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id
       AND user_id      = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Scope-consistency pre-check (belt-and-suspenders with table CHECK)
  IF p_scope_type = 'general' AND p_scope_entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'general-scope sessions must not have a scope_entity_id'
      USING ERRCODE = '22023';
  END IF;
  IF p_scope_type IN ('deal', 'event') AND p_scope_entity_id IS NULL THEN
    RAISE EXCEPTION '%-scope sessions require a scope_entity_id', p_scope_type
      USING ERRCODE = '22023';
  END IF;

  -- Scope-entity ownership validation
  IF p_scope_type = 'deal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.deals
       WHERE id           = p_scope_entity_id
         AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Deal not found in workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope_type = 'event' THEN
    -- Phase 2+: event-scoped sessions land when the UI is ready. Reject until
    -- then so we don't silently create orphan rows.
    RAISE EXCEPTION 'event-scoped sessions are not yet available'
      USING ERRCODE = '0A000';
  END IF;

  -- Resume if a non-archived session exists for this scope
  SELECT id INTO v_session_id
    FROM cortex.aion_sessions
   WHERE user_id         = v_user_id
     AND workspace_id    = p_workspace_id
     AND scope_type      = p_scope_type
     AND scope_entity_id IS NOT DISTINCT FROM p_scope_entity_id
     AND archived_at     IS NULL
   LIMIT 1;

  IF v_session_id IS NOT NULL THEN
    RETURN QUERY SELECT v_session_id, false;
    RETURN;
  END IF;

  -- Otherwise insert a fresh row
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

COMMENT ON FUNCTION cortex.resume_or_create_aion_session(uuid, text, uuid, text) IS
  'Resume-or-create an Aion session for the calling user in the given scope. Returns (session_id, is_new). SECURITY DEFINER: caller must be a workspace member and the scope entity must belong to that workspace. See docs/reference/aion-deal-chat-design.md §7.';

REVOKE ALL ON FUNCTION cortex.resume_or_create_aion_session(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.resume_or_create_aion_session(uuid, text, uuid, text)
  TO authenticated, service_role;

-- =============================================================================
-- 5. RPC — archive_aion_session (soft delete)
--
-- The existing cortex.delete_aion_session hard-deletes a session. The Aion-tab
-- sidebar uses archive (soft delete) by default so the conversation stays
-- readable in history. Explicit "delete permanently" can still call
-- delete_aion_session from a confirm dialog.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.archive_aion_session(
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
     SET archived_at = now()
   WHERE id          = p_session_id
     AND user_id     = v_user_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Session not found or not owned by caller'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION cortex.archive_aion_session(uuid) IS
  'Soft-delete an Aion session by stamping archived_at. Caller must own the session. Pair with the existing delete_aion_session for permanent removal. See docs/reference/aion-deal-chat-design.md §7.';

REVOKE ALL ON FUNCTION cortex.archive_aion_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.archive_aion_session(uuid)
  TO authenticated, service_role;

-- =============================================================================
-- 6. Audit (post-deploy sanity checks — run manually in SQL Editor)
-- =============================================================================
--
--   -- Confirm the new RPCs exist with the right grants
--   SELECT proname,
--     has_function_privilege('anon',          p.oid, 'EXECUTE') AS anon_exec,
--     has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_exec,
--     prosecdef AS sec_def
--   FROM pg_proc p
--   WHERE pronamespace = 'cortex'::regnamespace
--     AND proname IN ('resume_or_create_aion_session', 'archive_aion_session');
--   -- Expected: anon_exec=false, auth_exec=true, sec_def=true for both
--
--   -- Confirm the aion_threads* tables are gone
--   SELECT tablename FROM pg_tables
--    WHERE schemaname = 'cortex' AND tablename LIKE 'aion_thread%';
--   -- Expected: 0 rows
--
--   -- Confirm scope columns are present on aion_sessions
--   SELECT column_name FROM information_schema.columns
--    WHERE table_schema = 'cortex' AND table_name = 'aion_sessions'
--      AND column_name IN ('scope_type', 'scope_entity_id', 'pinned', 'archived_at');
--   -- Expected: all four present
