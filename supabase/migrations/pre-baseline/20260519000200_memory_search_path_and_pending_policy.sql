-- =============================================================================
-- Advisor cleanup for Phase 3 Sprint 1 Wk1–Wk3 migrations.
-- Applied 2026-04-22 via Supabase MCP after the 4 Sprint 1 migrations landed.
--
-- Two WARNs + one INFO surfaced by the post-apply advisor run:
--
--   • cortex.match_memory WARN (function_search_path_mutable) — the DROP +
--     CREATE in migration 20260519000100 didn't carry a SET search_path.
--     The original 20260408160000 definition didn't have one either, so
--     the advisor was always going to flag it once it ran — fix it now
--     while we're in the area. search_path includes `extensions` because
--     pgvector's `<=>` operator lives there.
--
--   • public.match_catalog WARN (function_search_path_mutable) — the
--     no-op wrapper we left for the migration-to-deploy window in
--     20260517000200. Same fix.
--
--   • cortex.memory_pending INFO (rls_enabled_no_policy) — RLS is enabled
--     on the queue but no policy exists. The design is "service role only
--     via RPCs" so an explicit deny-all policy for authenticated makes
--     the intent self-documenting and satisfies the linter.
-- =============================================================================

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
  source_id text,
  metadata jsonb,
  similarity float
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = cortex, public, extensions
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


CREATE OR REPLACE FUNCTION public.match_catalog(
  filter_workspace_id uuid,
  query_embedding extensions.vector(1024),
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
SET search_path = public, extensions
AS $$
  SELECT NULL::uuid, NULL::text, NULL::float WHERE false;
$$;


CREATE POLICY memory_pending_deny_authenticated ON cortex.memory_pending
  FOR ALL TO authenticated
  USING (false) WITH CHECK (false);

COMMENT ON POLICY memory_pending_deny_authenticated ON cortex.memory_pending IS
  'Internal queue — authenticated callers have no legitimate reason to read or write. Service role bypasses RLS for enqueue/drain RPC use.';
