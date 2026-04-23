-- =============================================================================
-- upsert_memory_embedding: add `extensions` to search_path.
--
-- Applied 2026-04-23 via Supabase MCP during live backfill smoke test.
--
-- Symptom: every backfill insert failed with
--   operator does not exist: extensions.vector = extensions.vector
--
-- Cause: the 20260519000100 widening migration set
--   SET search_path = cortex, public
-- but the function body's ON CONFLICT DO UPDATE uses `IS DISTINCT FROM` on
-- the embedding column. IS DISTINCT FROM needs the `=` operator; pgvector
-- defines `=` for vector/vector but it lives in the `extensions` schema,
-- which wasn't in the search_path. The companion 20260519000200 cleanup
-- fixed match_memory the same way; upsert was missed.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.upsert_memory_embedding(
  p_workspace_id uuid,
  p_source_type text,
  p_source_id text,
  p_content_text text,
  p_content_header text DEFAULT NULL,
  p_embedding extensions.vector(1024) DEFAULT NULL,
  p_entity_ids uuid[] DEFAULT '{}',
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public, extensions
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO cortex.memory (
    workspace_id, source_type, source_id, content_text, content_header,
    embedding, entity_ids, metadata
  )
  VALUES (
    p_workspace_id, p_source_type, p_source_id, p_content_text, p_content_header,
    p_embedding, p_entity_ids, p_metadata
  )
  ON CONFLICT (source_type, source_id) DO UPDATE SET
    content_text = EXCLUDED.content_text,
    content_header = EXCLUDED.content_header,
    embedding = EXCLUDED.embedding,
    entity_ids = EXCLUDED.entity_ids,
    metadata = EXCLUDED.metadata,
    updated_at = now(),
    last_rebuilt_at = CASE
      WHEN cortex.memory.embedding IS DISTINCT FROM EXCLUDED.embedding
        THEN now()
      ELSE cortex.memory.last_rebuilt_at
    END
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;
