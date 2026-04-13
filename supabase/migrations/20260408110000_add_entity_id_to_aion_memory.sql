-- Add entity_id column to cortex.aion_memory for entity-scoped episodic memory
-- Allows Aion to remember facts about specific people, companies, venues, and deals

ALTER TABLE cortex.aion_memory
  ADD COLUMN IF NOT EXISTS entity_id uuid REFERENCES directory.entities(id) ON DELETE CASCADE;

-- Replace workspace-only index with one that covers entity scope
DROP INDEX IF EXISTS cortex.idx_cortex_aion_memory_workspace;
CREATE INDEX idx_cortex_aion_memory_workspace_entity
  ON cortex.aion_memory (workspace_id, entity_id, scope);

-- Also add a focused index for entity-only lookups
CREATE INDEX idx_cortex_aion_memory_entity
  ON cortex.aion_memory (entity_id) WHERE entity_id IS NOT NULL;

-- Update save_aion_memory RPC to accept optional p_entity_id parameter
CREATE OR REPLACE FUNCTION cortex.save_aion_memory(
  p_workspace_id uuid,
  p_scope text,
  p_fact text,
  p_source text DEFAULT 'aion_chat',
  p_user_id uuid DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  -- Deduplicate: if an identical fact exists for same scope + user + entity, bump confidence
  UPDATE cortex.aion_memory
    SET updated_at = now(), confidence = LEAST(confidence + 0.1, 1.0)
    WHERE workspace_id = p_workspace_id
      AND scope = p_scope
      AND fact = p_fact
      AND user_id IS NOT DISTINCT FROM p_user_id
      AND entity_id IS NOT DISTINCT FROM p_entity_id
    RETURNING id INTO v_id;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO cortex.aion_memory (workspace_id, scope, fact, source, user_id, entity_id)
  VALUES (p_workspace_id, p_scope, p_fact, p_source, p_user_id, p_entity_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION cortex.save_aion_memory IS
  'Persist a learned fact to Aion memory. Scope: workspace-wide (user_id=NULL, entity_id=NULL), user-scoped (user_id set), entity-scoped (entity_id set). Deduplicates identical facts. SECURITY DEFINER — bypasses RLS for writes.';
