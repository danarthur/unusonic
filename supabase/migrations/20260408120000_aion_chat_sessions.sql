-- =============================================================================
-- cortex.aion_sessions + cortex.aion_messages
--
-- Database-backed chat sessions for Aion. Each user has their own sessions
-- within a workspace. Messages are persisted per-session with 90-day retention.
--
-- Follows cortex write protection: SELECT via RLS, writes via SECURITY DEFINER RPCs.
-- =============================================================================

-- ── Sessions ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cortex.aion_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title text,
  preview text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_aion_sessions_user
  ON cortex.aion_sessions (user_id, workspace_id, updated_at DESC);

ALTER TABLE cortex.aion_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY aion_sessions_select ON cortex.aion_sessions FOR SELECT USING (
  user_id = auth.uid()
  AND workspace_id IN (
    SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()
  )
);

-- ── Messages ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cortex.aion_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id uuid NOT NULL REFERENCES cortex.aion_sessions(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant', 'system')),
  content text NOT NULL DEFAULT '',
  structured_content jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz DEFAULT (now() + interval '90 days')
);

CREATE INDEX idx_aion_messages_session
  ON cortex.aion_messages (session_id, created_at);

ALTER TABLE cortex.aion_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY aion_messages_select ON cortex.aion_messages FOR SELECT USING (
  session_id IN (
    SELECT s.id FROM cortex.aion_sessions s WHERE s.user_id = auth.uid()
  )
);

-- ── RPCs ─────────────────────────────────────────────────────────────────────

-- Create a new session (accepts client-generated UUID to avoid race conditions)
CREATE OR REPLACE FUNCTION cortex.create_aion_session(
  p_workspace_id uuid,
  p_user_id uuid,
  p_id uuid DEFAULT gen_random_uuid(),
  p_preview text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
BEGIN
  INSERT INTO cortex.aion_sessions (id, workspace_id, user_id, preview)
  VALUES (p_id, p_workspace_id, p_user_id, p_preview);
  RETURN p_id;
END;
$$;

-- Save a message to a session (also bumps session updated_at)
CREATE OR REPLACE FUNCTION cortex.save_aion_message(
  p_session_id uuid,
  p_role text,
  p_content text,
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
    SET updated_at = now()
    WHERE id = p_session_id;

  RETURN v_id;
END;
$$;

-- Delete a session (ownership check via p_user_id)
CREATE OR REPLACE FUNCTION cortex.delete_aion_session(
  p_session_id uuid,
  p_user_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
BEGIN
  DELETE FROM cortex.aion_sessions
    WHERE id = p_session_id AND user_id = p_user_id;
  RETURN FOUND;
END;
$$;
