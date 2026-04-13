-- =============================================================================
-- Add user_id to cortex.aion_memory for per-user episodic memory
--
-- NULL user_id = workspace-wide memory (shared by all members)
-- Set user_id  = personal memory (visible only to that user + Aion)
-- =============================================================================

ALTER TABLE cortex.aion_memory
  ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;

-- Replace the workspace-only index with one that covers user-scoped queries
DROP INDEX IF EXISTS cortex.idx_cortex_aion_memory_workspace;
CREATE INDEX idx_cortex_aion_memory_workspace_user
  ON cortex.aion_memory (workspace_id, user_id, scope);

-- =============================================================================
-- Update RPC: save_aion_memory — now accepts optional p_user_id
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.save_aion_memory(
  p_workspace_id uuid,
  p_scope text,
  p_fact text,
  p_source text DEFAULT 'aion_chat',
  p_user_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Deduplicate: if an identical fact already exists for the same scope + user, bump it
  UPDATE cortex.aion_memory
    SET updated_at = now(), confidence = LEAST(confidence + 0.1, 1.0)
    WHERE workspace_id = p_workspace_id
      AND scope = p_scope
      AND fact = p_fact
      AND user_id IS NOT DISTINCT FROM p_user_id
    RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO cortex.aion_memory (workspace_id, scope, fact, source, user_id)
  VALUES (p_workspace_id, p_scope, p_fact, p_source, p_user_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION cortex.save_aion_memory IS
  'Persist a learned fact to Aion memory. p_user_id NULL = workspace-wide, set = personal. Deduplicates identical facts by bumping confidence and updated_at. SECURITY DEFINER — bypasses RLS for writes.';
