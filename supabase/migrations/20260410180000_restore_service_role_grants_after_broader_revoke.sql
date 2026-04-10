-- =============================================================================
-- Restore service_role EXECUTE on functions broken by the broader revoke.
--
-- Migration 20260410170000 called `REVOKE EXECUTE ... FROM PUBLIC` as a
-- belt-and-suspenders step alongside the REVOKE FROM anon. That was fine
-- for most functions — they had explicit service_role grants from earlier
-- migrations that the PUBLIC revoke didn't touch.
--
-- But 11 cortex.* functions and ops.patch_event_ros_data were originally
-- created with ONLY the implicit PUBLIC grant — no explicit role grants at
-- all. For those, REVOKE FROM PUBLIC removed the only grant they had,
-- locking out every role including service_role. The Aion chat flow
-- (api/aion/* → getSystemClient() → cortex.* rpc calls) was broken as a
-- result.
--
-- Fix: explicitly GRANT EXECUTE back to service_role on the 12 affected
-- functions. The anon block from 20260410170000 is preserved — those
-- REVOKE FROM anon statements stand, because service_role grants don't
-- cascade to anon.
--
-- Caller verification: every one of these is invoked from server-side
-- code via `getSystemClient()` only:
--   - cortex.create_aion_session      ← api/brain/actions/aion-session-actions.ts
--   - cortex.save_aion_message        ← same file
--   - cortex.delete_aion_session      ← same file
--   - cortex.update_aion_session_summary ← same file
--   - cortex.save_aion_memory         ← api/aion/chat/tools/core.ts, learn-from-edit
--   - cortex.upsert_memory_embedding  ← api/aion/lib/embeddings.ts
--   - cortex.upsert_aion_insight      ← api/aion/lib/insight-evaluators.ts
--   - cortex.dismiss_aion_insight     ← (not wired to app code yet, but grant restored for parity)
--   - cortex.resolve_aion_insight     ← (same)
--   - cortex.delete_memory_embedding  ← (same)
--   - cortex.hybrid_search            ← (not wired, but grant restored)
--   - ops.patch_event_ros_data        ← authenticated had an explicit grant and still works;
--                                       service_role didn't, and still doesn't need to today,
--                                       but restoring for consistency with sibling ops.* grants.
-- =============================================================================

-- Cortex functions
GRANT EXECUTE ON FUNCTION cortex.create_aion_session(p_workspace_id uuid, p_user_id uuid, p_id uuid, p_preview text) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.delete_aion_session(p_session_id uuid, p_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.delete_memory_embedding(p_source_type text, p_source_id text) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.dismiss_aion_insight(p_insight_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.hybrid_search(query_text text, query_embedding vector, match_count integer, full_text_weight double precision, semantic_weight double precision, rrf_k integer) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.resolve_aion_insight(p_trigger_type text, p_entity_id text) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.save_aion_memory(p_workspace_id uuid, p_scope text, p_fact text, p_source text, p_user_id uuid) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.save_aion_message(p_session_id uuid, p_role text, p_content text, p_structured_content jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.update_aion_session_summary(p_session_id uuid, p_summary text, p_summarized_up_to text) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.upsert_aion_insight(p_workspace_id uuid, p_trigger_type text, p_entity_type text, p_entity_id text, p_title text, p_context jsonb, p_priority integer, p_expires_at timestamp with time zone) TO service_role;
GRANT EXECUTE ON FUNCTION cortex.upsert_memory_embedding(p_workspace_id uuid, p_source_type text, p_source_id text, p_content_text text, p_content_header text, p_embedding vector, p_entity_ids uuid[], p_metadata jsonb) TO service_role;

-- ops function (authenticated still has its explicit grant)
GRANT EXECUTE ON FUNCTION ops.patch_event_ros_data(p_event_id uuid, p_patch jsonb) TO service_role;
