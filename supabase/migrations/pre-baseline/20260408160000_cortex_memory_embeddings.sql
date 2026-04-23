-- =============================================================================
-- cortex.memory — Vector embeddings for workspace knowledge
--
-- Semantic search over deal notes, follow-up logs, proposal text, event notes.
-- Each row = one source record embedded as a single chunk.
-- Short business content (50-500 words) is NOT chunked — embedded whole.
--
-- Follows cortex write protection: SELECT via RLS, writes via SECURITY DEFINER RPCs.
-- Match function is SECURITY INVOKER so RLS applies to the SELECT.
-- =============================================================================

CREATE TABLE IF NOT EXISTS cortex.memory (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  source_type text NOT NULL,
  source_id text NOT NULL,
  entity_ids uuid[] DEFAULT '{}',
  content_text text NOT NULL,
  content_header text,
  embedding extensions.vector(1024) NOT NULL,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(source_type, source_id)
);

COMMENT ON TABLE cortex.memory IS
  'Vector embeddings for workspace knowledge (deal notes, follow-ups, proposals, events). One embedding per source record. Used by Aion search_workspace_knowledge tool.';

-- ── Indexes ──────────────────────────────────────────────────────────────────

CREATE INDEX idx_memory_workspace_source ON cortex.memory (workspace_id, source_type);
CREATE INDEX idx_memory_entity_ids ON cortex.memory USING gin (entity_ids);
CREATE INDEX idx_memory_embedding ON cortex.memory
  USING hnsw (embedding extensions.vector_cosine_ops)
  WITH (m = 16, ef_construction = 200);

-- ── RLS: SELECT only ─────────────────────────────────────────────────────────

ALTER TABLE cortex.memory ENABLE ROW LEVEL SECURITY;

CREATE POLICY memory_select ON cortex.memory FOR SELECT USING (
  workspace_id IN (SELECT get_my_workspace_ids())
);

-- ── Write RPCs (SECURITY DEFINER — bypasses RLS) ────────────────────────────

CREATE OR REPLACE FUNCTION cortex.upsert_memory_embedding(
  p_workspace_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_content_text text,
  p_content_header text DEFAULT NULL,
  p_embedding extensions.vector(1024) DEFAULT NULL,
  p_entity_ids uuid[] DEFAULT '{}',
  p_metadata jsonb DEFAULT '{}'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
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
    updated_at = now()
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

CREATE OR REPLACE FUNCTION cortex.delete_memory_embedding(
  p_source_type text,
  p_source_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
BEGIN
  DELETE FROM cortex.memory
    WHERE source_type = p_source_type AND source_id = p_source_id;
  RETURN FOUND;
END;
$$;

-- ── Match RPC (SECURITY INVOKER — RLS applies) ──────────────────────────────

CREATE OR REPLACE FUNCTION cortex.match_memory(
  p_workspace_id uuid,
  p_query_embedding extensions.vector(1024),
  p_match_count int DEFAULT 5,
  p_match_threshold float DEFAULT 0.3,
  p_source_types text[] DEFAULT NULL,
  p_entity_ids uuid[] DEFAULT NULL
)
RETURNS TABLE (
  id uuid,
  content_text text,
  content_header text,
  source_type text,
  source_id uuid,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    m.id,
    m.content_text,
    m.content_header,
    m.source_type,
    m.source_id,
    m.metadata,
    1 - (m.embedding <=> p_query_embedding) AS similarity
  FROM cortex.memory m
  WHERE m.workspace_id = p_workspace_id
    AND 1 - (m.embedding <=> p_query_embedding) > p_match_threshold
    AND (p_source_types IS NULL OR m.source_type = ANY(p_source_types))
    AND (p_entity_ids IS NULL OR m.entity_ids && p_entity_ids)
  ORDER BY m.embedding <=> p_query_embedding
  LIMIT least(p_match_count, 50);
$$;

COMMENT ON FUNCTION cortex.match_memory IS
  'Semantic search over workspace knowledge embeddings. Filters by workspace, optional source_type, optional entity_ids (array overlap). RLS applies via SECURITY INVOKER.';
