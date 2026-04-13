-- =============================================================================
-- cortex.aion_memory — Aion episodic memory
--
-- Stores learned facts about the workspace, clients, and deals.
-- Procedural memory (voice config, patterns, vocabulary) stays in
-- workspaces.aion_config. This table is for episodic facts:
-- "Sarah prefers email", "Johnson always pays late", etc.
--
-- Separate from cortex.memory (vector/RAG embeddings for entities).
-- Follows cortex write protection: SELECT via RLS, writes via SECURITY DEFINER RPC.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cortex.aion_memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('episodic', 'procedural', 'semantic')),
  fact text NOT NULL,
  source text DEFAULT 'aion_chat',
  confidence numeric DEFAULT 1.0 CHECK (confidence >= 0 AND confidence <= 1),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz
);

CREATE INDEX IF NOT EXISTS idx_cortex_aion_memory_workspace
  ON cortex.aion_memory (workspace_id, scope);

ALTER TABLE cortex.aion_memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY aion_memory_select ON cortex.aion_memory FOR SELECT USING (
  workspace_id IN (
    SELECT wm.workspace_id FROM public.workspace_members wm WHERE wm.user_id = auth.uid()
  )
);

-- No INSERT/UPDATE/DELETE policies — writes via SECURITY DEFINER RPC only

-- =============================================================================
-- RPC: save_aion_memory
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.save_aion_memory(
  p_workspace_id uuid,
  p_scope text,
  p_fact text,
  p_source text DEFAULT 'aion_chat'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Deduplicate: if an identical fact already exists, update its timestamp
  UPDATE cortex.aion_memory
    SET updated_at = now(), confidence = LEAST(confidence + 0.1, 1.0)
    WHERE workspace_id = p_workspace_id
      AND scope = p_scope
      AND fact = p_fact
    RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO cortex.aion_memory (workspace_id, scope, fact, source)
  VALUES (p_workspace_id, p_scope, p_fact, p_source)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION cortex.save_aion_memory IS
  'Persist a learned fact to Aion episodic memory. Deduplicates identical facts by bumping confidence and updated_at. SECURITY DEFINER — bypasses RLS for writes.';
