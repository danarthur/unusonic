-- Catalog embeddings for ION: semantic search over packages (RAG).
-- One row per package; content_text = name + description + definition summary for embedding.
-- RLS by workspace_id so ION only sees the current workspace's catalog.
-- ARCHIVED: Applied as catalog_embeddings_for_ion (20260219001331). Do not run again.

CREATE TABLE IF NOT EXISTS public.catalog_embeddings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  package_id uuid NOT NULL REFERENCES public.packages(id) ON DELETE CASCADE,
  content_text text NOT NULL,
  embedding extensions.vector(1536) NOT NULL,
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(workspace_id, package_id)
);

COMMENT ON TABLE public.catalog_embeddings IS 'Vector embeddings for catalog packages; used by ION for semantic search (RAG). One row per package.';

CREATE INDEX IF NOT EXISTS catalog_embeddings_workspace_id_idx ON public.catalog_embeddings(workspace_id);
CREATE INDEX IF NOT EXISTS catalog_embeddings_embedding_idx ON public.catalog_embeddings
  USING hnsw (embedding extensions.vector_cosine_ops);

ALTER TABLE public.catalog_embeddings ENABLE ROW LEVEL SECURITY;

CREATE POLICY catalog_embeddings_workspace_select ON public.catalog_embeddings
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY catalog_embeddings_workspace_insert ON public.catalog_embeddings
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY catalog_embeddings_workspace_update ON public.catalog_embeddings
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY catalog_embeddings_workspace_delete ON public.catalog_embeddings
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

-- Semantic search: match packages by embedding within a workspace.
-- Caller must pass workspace_id; RLS still applies so only rows they can read are considered.
CREATE OR REPLACE FUNCTION public.match_catalog(
  filter_workspace_id uuid,
  query_embedding extensions.vector(1536),
  match_count int DEFAULT 10,
  match_threshold float DEFAULT 0.5
)
RETURNS TABLE (
  package_id uuid,
  content_text text,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
AS $$
  SELECT
    ce.package_id,
    ce.content_text,
    1 - (ce.embedding <=> query_embedding) AS similarity
  FROM public.catalog_embeddings ce
  WHERE ce.workspace_id = filter_workspace_id
    AND 1 - (ce.embedding <=> query_embedding) > match_threshold
  ORDER BY ce.embedding <=> query_embedding
  LIMIT least(match_count, 50);
$$;

COMMENT ON FUNCTION public.match_catalog IS 'ION: semantic search over catalog embeddings. Returns package_id, content_text, similarity. RLS applies.';
