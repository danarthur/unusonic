-- =============================================================================
-- Widen cortex.memory source_id from uuid (param) to text
-- Phase 3 Sprint 1 Week 3. Plan §3.1 C2 + §3.3.
--
-- Context. cortex.memory.source_id has been `text NOT NULL` since the table
-- was created (migration 20260408160000), but the three RPCs (upsert,
-- delete, match) declared the source_id parameter/return as uuid. Live
-- values today are all UUIDs, so the implicit cast has worked; but Phase 3
-- Sprint 1 Week 3 introduces activity-log chunks with composite keys like
-- `<deal_uuid>:YYYYMM`, which are NOT valid uuids and would be rejected by
-- the current RPC signatures.
--
-- Scope. Widens the RPC surface + the one downstream table
-- (cortex.memory_pending.source_id) to match the underlying text column.
-- All existing callers continue to work — uuid → text is a widening.
--
-- Affected functions:
--   • cortex.upsert_memory_embedding      (p_source_id)
--   • cortex.delete_memory_embedding      (p_source_id)
--   • cortex.match_memory                 (source_id return column)
--   • cortex.enqueue_memory_pending       (p_source_id, p_entity_ids unchanged)
--   • cortex.claim_memory_pending_batch   (source_id return column)
--   • cortex.mark_memory_pending_result   (unchanged — operates on queue id)
--
-- RLS + grants posture preserved per feedback_postgres_function_grants.md
-- (REVOKE PUBLIC/anon, GRANT service_role for write RPCs; SECURITY INVOKER
-- on match_memory unchanged so RLS still scopes reads).
-- =============================================================================


-- ── 1. Widen cortex.memory_pending.source_id ──────────────────────────────────
--
-- The queue table was defined in migration 20260518000100 with source_id
-- uuid. Convert in place — no rows in prod yet (queue drains continuously)
-- so the ALTER is instant.

ALTER TABLE cortex.memory_pending
  ALTER COLUMN source_id TYPE text USING source_id::text;


-- ── 2. Drop + recreate cortex.upsert_memory_embedding ─────────────────────────

DROP FUNCTION IF EXISTS cortex.upsert_memory_embedding(
  uuid, text, uuid, text, text, extensions.vector, uuid[], jsonb
);

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

COMMENT ON FUNCTION cortex.upsert_memory_embedding(uuid, text, text, text, text, extensions.vector, uuid[], jsonb) IS
  'Upsert a memory row keyed on (source_type, source_id). source_id is text to support composite chunk keys like <deal_uuid>:YYYYMM for activity-log rollups. last_rebuilt_at bumps only when the embedding actually changed — supports targeted re-embed detection.';

REVOKE EXECUTE ON FUNCTION cortex.upsert_memory_embedding(uuid, text, text, text, text, extensions.vector, uuid[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cortex.upsert_memory_embedding(uuid, text, text, text, text, extensions.vector, uuid[], jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION cortex.upsert_memory_embedding(uuid, text, text, text, text, extensions.vector, uuid[], jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION cortex.upsert_memory_embedding(uuid, text, text, text, text, extensions.vector, uuid[], jsonb) TO service_role;


-- ── 3. Drop + recreate cortex.delete_memory_embedding ─────────────────────────

DROP FUNCTION IF EXISTS cortex.delete_memory_embedding(text, uuid);

CREATE OR REPLACE FUNCTION cortex.delete_memory_embedding(
  p_source_type text,
  p_source_id text
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

REVOKE EXECUTE ON FUNCTION cortex.delete_memory_embedding(text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cortex.delete_memory_embedding(text, text) FROM anon;
REVOKE EXECUTE ON FUNCTION cortex.delete_memory_embedding(text, text) FROM authenticated;
GRANT  EXECUTE ON FUNCTION cortex.delete_memory_embedding(text, text) TO service_role;


-- ── 4. Drop + recreate cortex.match_memory ────────────────────────────────────
--
-- SECURITY INVOKER preserved so RLS on cortex.memory still scopes reads.

DROP FUNCTION IF EXISTS cortex.match_memory(uuid, extensions.vector, int, float, text[], uuid[]);

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
  'Semantic search over workspace knowledge embeddings. RLS applies via SECURITY INVOKER. source_id returned as text to carry both UUID rows and composite activity-log chunk keys.';


-- ── 5. Drop + recreate cortex.enqueue_memory_pending ──────────────────────────

DROP FUNCTION IF EXISTS cortex.enqueue_memory_pending(uuid, text, uuid, text, text, uuid[], jsonb);

CREATE OR REPLACE FUNCTION cortex.enqueue_memory_pending(
  p_workspace_id    uuid,
  p_source_type     text,
  p_source_id       text,
  p_content_text    text,
  p_content_header  text DEFAULT NULL,
  p_entity_ids      uuid[] DEFAULT '{}',
  p_metadata        jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO cortex.memory_pending (
    workspace_id, source_type, source_id, content_text, content_header,
    entity_ids, metadata
  )
  VALUES (
    p_workspace_id, p_source_type, p_source_id, p_content_text, p_content_header,
    p_entity_ids, p_metadata
  )
  ON CONFLICT (source_type, source_id) DO UPDATE SET
    content_text       = EXCLUDED.content_text,
    content_header     = EXCLUDED.content_header,
    entity_ids         = EXCLUDED.entity_ids,
    metadata           = EXCLUDED.metadata,
    attempts           = 0,
    next_attempt_after = now(),
    last_error         = NULL,
    last_attempted_at  = NULL
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$$;

COMMENT ON FUNCTION cortex.enqueue_memory_pending IS
  'Service-role-only enqueue. source_id is text to support composite activity-log chunk keys (e.g. <deal_uuid>:YYYYMM).';

REVOKE EXECUTE ON FUNCTION cortex.enqueue_memory_pending(uuid, text, text, text, text, uuid[], jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cortex.enqueue_memory_pending(uuid, text, text, text, text, uuid[], jsonb) FROM anon;
REVOKE EXECUTE ON FUNCTION cortex.enqueue_memory_pending(uuid, text, text, text, text, uuid[], jsonb) FROM authenticated;
GRANT  EXECUTE ON FUNCTION cortex.enqueue_memory_pending(uuid, text, text, text, text, uuid[], jsonb) TO service_role;


-- ── 6. Drop + recreate cortex.claim_memory_pending_batch ──────────────────────
--
-- Signature changes only in the RETURN TABLE — source_id uuid → text. The
-- drain cron inspects source_type to decide how to interpret source_id
-- (UUID for message/note/follow-up; composite `<deal>:YYYYMM` for
-- activity_log chunks).

DROP FUNCTION IF EXISTS cortex.claim_memory_pending_batch(int);

CREATE OR REPLACE FUNCTION cortex.claim_memory_pending_batch(
  p_limit int DEFAULT 50
)
RETURNS TABLE (
  id             uuid,
  workspace_id   uuid,
  source_type    text,
  source_id      text,
  content_text   text,
  content_header text,
  entity_ids     uuid[],
  metadata       jsonb,
  attempts       int
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex
AS $$
BEGIN
  RETURN QUERY
    UPDATE cortex.memory_pending p
    SET last_attempted_at = now(),
        attempts = p.attempts + 1
    WHERE p.id IN (
      SELECT q.id
      FROM cortex.memory_pending q
      WHERE q.next_attempt_after <= now()
        AND q.attempts < 6
      ORDER BY q.enqueued_at
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING
      p.id, p.workspace_id, p.source_type, p.source_id,
      p.content_text, p.content_header, p.entity_ids, p.metadata,
      p.attempts;
END;
$$;

REVOKE EXECUTE ON FUNCTION cortex.claim_memory_pending_batch(int) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION cortex.claim_memory_pending_batch(int) FROM anon;
REVOKE EXECUTE ON FUNCTION cortex.claim_memory_pending_batch(int) FROM authenticated;
GRANT  EXECUTE ON FUNCTION cortex.claim_memory_pending_batch(int) TO service_role;


-- =============================================================================
-- Notes on mark_memory_pending_result
--
-- Operates on the queue row's own id (uuid) — no source_id coupling — so
-- the signature is unchanged. No action needed here.
-- =============================================================================
