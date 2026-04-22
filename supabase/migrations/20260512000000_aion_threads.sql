-- =============================================================================
-- cortex.aion_threads + cortex.aion_thread_messages — unified Aion chat store
--
-- Design spec: docs/reference/aion-deal-chat-design.md
--
-- One thread store backs two views:
--   1. The deal-card view on the CRM deal tab — constrained, scope='deal'
--   2. The /aion top-nav tab — full chat, scope='general' or scope='deal'
--
-- A conversation started on the deal card is the same row you resume in the
-- Aion tab and vice versa. Sidebar in the Aion tab groups by scope section
-- (Deals / General / future Event sessions).
--
-- Design principles encoded below:
--   * Per-user threads (not workspace-shared) — private by default, RLS
--     enforces `user_id = auth.uid()` in addition to workspace membership.
--   * Generic scope column (scope_type + scope_entity_id) — ready for future
--     scopes ('event', 'client', …) without schema migration.
--   * UNIQUE (user_id, scope_type, scope_entity_id) on non-archived rows —
--     implements the "resume if exists, else create" contract. Opening the
--     deal card and opening the Aion-tab deal session both resolve to the
--     same thread.
--   * Messages live in a separate table (cortex.aion_thread_messages) —
--     threads are stable, messages grow fast; this keeps sidebar queries
--     cheap.
--   * Cortex write protection: SELECT policies only. All mutations go through
--     SECURITY DEFINER RPCs defined below.
--   * Context fingerprint on each message captures the scope-context hash at
--     write time — used by chat API to detect staleness and invalidate the
--     Anthropic prompt cache.
--
-- Security discipline (per feedback_postgres_function_grants memory note):
--   * Every RPC below REVOKE ALL FROM PUBLIC, anon in this same migration.
--     SECURITY DEFINER + anon-executable = catastrophic privilege escalation.
--   * Every RPC SET search_path = pg_catalog, cortex, public to block
--     search-path injection.
-- =============================================================================

-- =============================================================================
-- 1. Tables
-- =============================================================================

CREATE TABLE IF NOT EXISTS cortex.aion_threads (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id          uuid NOT NULL REFERENCES auth.users(id)         ON DELETE CASCADE,
  scope_type       text NOT NULL CHECK (scope_type IN ('deal', 'general', 'event')),
  scope_entity_id  uuid,
  title            text,
  pinned           boolean NOT NULL DEFAULT false,
  last_message_at  timestamptz NOT NULL DEFAULT now(),
  archived_at      timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),

  -- scope consistency:
  --   'general' threads have no scope_entity_id
  --   'deal' and 'event' threads MUST have a scope_entity_id
  CONSTRAINT aion_threads_scope_consistency CHECK (
    (scope_type = 'general' AND scope_entity_id IS NULL)
    OR (scope_type IN ('deal', 'event') AND scope_entity_id IS NOT NULL)
  )
);

-- Resume contract: at most one non-archived thread per (user, scope, entity).
-- Deal scope: one deal thread per user per deal. General scope: one general
-- thread per user per workspace (scope_entity_id IS NULL → uses workspace_id
-- to disambiguate). Archived rows are excluded so re-opening creates fresh.
CREATE UNIQUE INDEX IF NOT EXISTS aion_threads_scope_unique_active
  ON cortex.aion_threads (user_id, workspace_id, scope_type, COALESCE(scope_entity_id, '00000000-0000-0000-0000-000000000000'::uuid))
  WHERE archived_at IS NULL;

-- Sidebar fetch: most-recent-first within a user's workspace, excluding archived
CREATE INDEX IF NOT EXISTS aion_threads_sidebar
  ON cortex.aion_threads (user_id, workspace_id, archived_at, last_message_at DESC);

-- Scope-entity lookups (e.g., "give me all threads referencing this deal")
CREATE INDEX IF NOT EXISTS aion_threads_scope_entity
  ON cortex.aion_threads (scope_entity_id)
  WHERE scope_entity_id IS NOT NULL;

-- Messages table — separate from threads so the fat column (content jsonb)
-- doesn't bloat sidebar queries. One row per message in the conversation.
CREATE TABLE IF NOT EXISTS cortex.aion_thread_messages (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id            uuid NOT NULL REFERENCES cortex.aion_threads(id) ON DELETE CASCADE,
  role                 text NOT NULL CHECK (role IN ('user', 'assistant', 'tool')),
  content              jsonb NOT NULL,  -- { text, tool_calls?, tool_results?, attachments? }
  context_fingerprint  text,             -- hash of scope context serialized at write time
  created_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS aion_thread_messages_thread
  ON cortex.aion_thread_messages (thread_id, created_at);

-- =============================================================================
-- 2. Row-level security — SELECT only. Writes via SECURITY DEFINER RPCs.
-- =============================================================================

ALTER TABLE cortex.aion_threads         ENABLE ROW LEVEL SECURITY;
ALTER TABLE cortex.aion_thread_messages ENABLE ROW LEVEL SECURITY;

-- Threads: per-user isolation + workspace membership
-- A user sees only their own threads, and only in workspaces they belong to.
-- Dual check guards against two leak paths:
--   1. A user querying another user's thread in the same workspace
--   2. A user querying their own thread after being removed from the workspace
CREATE POLICY aion_threads_select ON cortex.aion_threads FOR SELECT USING (
  user_id = auth.uid()
  AND workspace_id IN (
    SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()
  )
);

-- Messages: inherit thread visibility via thread_id lookup
CREATE POLICY aion_thread_messages_select ON cortex.aion_thread_messages FOR SELECT USING (
  thread_id IN (
    SELECT id FROM cortex.aion_threads
     WHERE user_id = auth.uid()
       AND workspace_id IN (
         SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()
       )
  )
);

-- No INSERT/UPDATE/DELETE policies — writes go through SECURITY DEFINER RPCs
-- below. This is the cortex write-protection pattern (CLAUDE.md §3).

-- =============================================================================
-- 3. RPCs — create_aion_thread, append_aion_message, archive_aion_thread
-- =============================================================================

-- -----------------------------------------------------------------------------
-- cortex.create_aion_thread
--
-- Implements the "resume if exists, else create" contract. Returns the thread
-- id + is_new flag so the caller can decide whether to play an empty-state
-- animation vs jump straight into the existing conversation.
--
-- Scope validation:
--   * scope_type='deal'    → p_scope_entity_id must reference a deal the
--                            caller's workspace owns. We check workspace_id
--                            matches public.deals.workspace_id.
--   * scope_type='event'   → same pattern against ops.events (Phase 2+; the
--                            CHECK constraint allows it but the RPC raises
--                            until Phase 2 wires this up).
--   * scope_type='general' → scope_entity_id must be NULL. Workspace is
--                            provided directly by the caller.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cortex.create_aion_thread(
  p_workspace_id     uuid,
  p_scope_type       text,
  p_scope_entity_id  uuid DEFAULT NULL,
  p_title            text DEFAULT NULL
)
RETURNS TABLE (thread_id uuid, is_new boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cortex, public, ops
AS $$
DECLARE
  v_user_id        uuid;
  v_thread_id      uuid;
BEGIN
  -- 0. Require an authenticated session
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- 1. Caller must be a member of the target workspace
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
     WHERE workspace_id = p_workspace_id
       AND user_id      = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- 2. Scope-consistency pre-check (the table CHECK constraint also enforces
  --    this but we give a nicer error up front)
  IF p_scope_type = 'general' AND p_scope_entity_id IS NOT NULL THEN
    RAISE EXCEPTION 'general-scope threads must not have a scope_entity_id'
      USING ERRCODE = '22023';
  END IF;
  IF p_scope_type IN ('deal', 'event') AND p_scope_entity_id IS NULL THEN
    RAISE EXCEPTION '%-scope threads require a scope_entity_id', p_scope_type
      USING ERRCODE = '22023';
  END IF;

  -- 3. Scope entity must belong to the caller's workspace
  IF p_scope_type = 'deal' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.deals
       WHERE id           = p_scope_entity_id
         AND workspace_id = p_workspace_id
    ) THEN
      RAISE EXCEPTION 'Deal not found in workspace' USING ERRCODE = '42501';
    END IF;
  ELSIF p_scope_type = 'event' THEN
    -- Phase 2+: ops.events scope_entity_id validation lands when event-scoped
    -- threads ship. Until then we reject to avoid silently creating orphan
    -- threads the UI has no view for.
    RAISE EXCEPTION 'event-scoped threads are not yet available'
      USING ERRCODE = '0A000';
  END IF;

  -- 4. Resume if a non-archived thread already exists
  SELECT id INTO v_thread_id
    FROM cortex.aion_threads
   WHERE user_id         = v_user_id
     AND workspace_id    = p_workspace_id
     AND scope_type      = p_scope_type
     AND scope_entity_id IS NOT DISTINCT FROM p_scope_entity_id
     AND archived_at     IS NULL
   LIMIT 1;

  IF v_thread_id IS NOT NULL THEN
    RETURN QUERY SELECT v_thread_id, false;
    RETURN;
  END IF;

  -- 5. Otherwise insert a fresh thread
  INSERT INTO cortex.aion_threads (
    workspace_id, user_id, scope_type, scope_entity_id, title
  )
  VALUES (
    p_workspace_id, v_user_id, p_scope_type, p_scope_entity_id, p_title
  )
  RETURNING id INTO v_thread_id;

  RETURN QUERY SELECT v_thread_id, true;
END;
$$;

COMMENT ON FUNCTION cortex.create_aion_thread(uuid, text, uuid, text) IS
  'Resume-or-create an Aion conversation thread for the calling user. Returns (thread_id, is_new). SECURITY DEFINER: caller must be a workspace member and the scope entity must belong to that workspace. See docs/reference/aion-deal-chat-design.md §7.';

REVOKE ALL ON FUNCTION cortex.create_aion_thread(uuid, text, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.create_aion_thread(uuid, text, uuid, text)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- cortex.append_aion_message
--
-- Appends a message row to a thread and bumps last_message_at so the sidebar
-- sort stays fresh. Auth contract: the caller must own the thread (user_id =
-- auth.uid()).
--
-- role='tool' messages are the Vercel AI SDK tool-result format; content
-- should carry { tool_call_id, tool_name, result }. We don't validate that
-- shape at the DB layer — the chat API is the enforcement point.
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cortex.append_aion_message(
  p_thread_id            uuid,
  p_role                 text,
  p_content              jsonb,
  p_context_fingerprint  text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, cortex, public
AS $$
DECLARE
  v_user_id    uuid;
  v_thread_ok  boolean;
  v_message_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Thread ownership check — must belong to this user AND be in a workspace
  -- they're still a member of. The latter guards against a removed member
  -- writing to an old thread.
  SELECT EXISTS (
    SELECT 1
      FROM cortex.aion_threads t
      JOIN public.workspace_members wm
        ON wm.workspace_id = t.workspace_id
       AND wm.user_id      = v_user_id
     WHERE t.id          = p_thread_id
       AND t.user_id     = v_user_id
       AND t.archived_at IS NULL
  ) INTO v_thread_ok;

  IF NOT v_thread_ok THEN
    RAISE EXCEPTION 'Thread not found or not owned by caller'
      USING ERRCODE = '42501';
  END IF;

  IF p_role NOT IN ('user', 'assistant', 'tool') THEN
    RAISE EXCEPTION 'Invalid role: %', p_role USING ERRCODE = '22023';
  END IF;

  INSERT INTO cortex.aion_thread_messages (thread_id, role, content, context_fingerprint)
  VALUES (p_thread_id, p_role, p_content, p_context_fingerprint)
  RETURNING id INTO v_message_id;

  -- Bump last_message_at for sidebar sort. Leave updated_at alone (we don't
  -- track it on threads — last_message_at is the canonical "active" signal).
  UPDATE cortex.aion_threads
     SET last_message_at = now()
   WHERE id = p_thread_id;

  RETURN v_message_id;
END;
$$;

COMMENT ON FUNCTION cortex.append_aion_message(uuid, text, jsonb, text) IS
  'Append a message to an Aion thread and bump last_message_at. SECURITY DEFINER: caller must own the thread and still be a member of its workspace. See docs/reference/aion-deal-chat-design.md §7.';

REVOKE ALL ON FUNCTION cortex.append_aion_message(uuid, text, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.append_aion_message(uuid, text, jsonb, text)
  TO authenticated, service_role;

-- -----------------------------------------------------------------------------
-- cortex.archive_aion_thread
--
-- Soft-delete a thread by stamping archived_at. Hard delete isn't exposed —
-- archived threads preserve audit trail and stay readable by the owner.
-- The unique-active index excludes archived rows, so re-opening the same
-- scope creates a fresh thread (which is the right "new conversation"
-- semantic).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION cortex.archive_aion_thread(
  p_thread_id uuid
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

  UPDATE cortex.aion_threads
     SET archived_at = now()
   WHERE id          = p_thread_id
     AND user_id     = v_user_id
     AND archived_at IS NULL;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Thread not found or not owned by caller'
      USING ERRCODE = '42501';
  END IF;
END;
$$;

COMMENT ON FUNCTION cortex.archive_aion_thread(uuid) IS
  'Soft-delete an Aion thread by stamping archived_at. Caller must own the thread. See docs/reference/aion-deal-chat-design.md §7.';

REVOKE ALL ON FUNCTION cortex.archive_aion_thread(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.archive_aion_thread(uuid)
  TO authenticated, service_role;

-- =============================================================================
-- 4. Audit (post-deploy sanity checks — run manually in SQL Editor)
-- =============================================================================
--
--   -- Confirm anon cannot execute any of the three RPCs:
--   SELECT
--     proname,
--     has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
--   FROM pg_proc p
--   WHERE pronamespace = 'cortex'::regnamespace
--     AND proname IN ('create_aion_thread', 'append_aion_message', 'archive_aion_thread');
--   -- Expected: anon_can_execute = false for all three
--
--   -- Confirm RLS enabled on both tables:
--   SELECT relname, relrowsecurity FROM pg_class
--    WHERE relnamespace = 'cortex'::regnamespace
--      AND relname IN ('aion_threads', 'aion_thread_messages');
--   -- Expected: relrowsecurity = true for both
