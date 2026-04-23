-- =============================================================================
-- cortex.memory source_type extension — Phase 3 Sprint 1 Week 1
--
-- Preparation for:
--   1. Catalog consolidation — catalog embeddings move from
--      public.catalog_embeddings into cortex.memory with source_type='catalog'.
--   2. ops.messages ingestion (Sprint 1 Week 2) — source_type='message'.
--   3. update_narrative write tool (Sprint 2) — source_type='narrative'.
--   4. Activity-log RAG (Sprint 1 Week 3) — source_type='activity_log'.
--
-- Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.1.
--
-- Existing source_type values in live data (Sprint 0 probe, 2026-04-23):
--   deal_note, follow_up, capture (9 rows). All remain valid.
--
-- No index change: cortex.memory already has
--   CREATE INDEX idx_memory_workspace_source ON cortex.memory (workspace_id, source_type);
-- (BTREE composite — right index for scalar columns. Plan §3.1's mention of
-- a GIN index applies to array columns; skip here and document.)
-- =============================================================================

-- ── 1. last_rebuilt_at column ────────────────────────────────────────────────
--
-- Used by activity-log chunking (Sprint 1 Week 3) for targeted invalidation:
-- when a backdated activity row enqueues a re-embed of an existing
-- (deal_id, YYYYMM) chunk, the drain cron bumps last_rebuilt_at so we can
-- detect stale chunks without rescanning content_text. Nullable; NULL means
-- "original embed, never retroactively rebuilt."

ALTER TABLE cortex.memory
  ADD COLUMN IF NOT EXISTS last_rebuilt_at timestamptz;

COMMENT ON COLUMN cortex.memory.last_rebuilt_at IS
  'Set when a (source_type, source_id) row is re-embedded due to backdated or corrected content. NULL on initial insert. Used by activity-log chunk invalidation.';


-- ── 2. source_type CHECK constraint ──────────────────────────────────────────
--
-- Defence-in-depth against typos in ingestion callers. New source types must
-- be added here in a follow-up migration before they're written by app code.

ALTER TABLE cortex.memory
  ADD CONSTRAINT memory_source_type_chk CHECK (
    source_type IN (
      'deal_note',
      'follow_up',
      'proposal',
      'event_note',
      'capture',
      'message',
      'narrative',
      'activity_log',
      'catalog'
    )
  );

COMMENT ON CONSTRAINT memory_source_type_chk ON cortex.memory IS
  'Source-type whitelist — bumping requires a migration. Keeps callers honest.';
