-- =============================================================================
-- Drop legacy public.catalog_embeddings + public.match_catalog
-- Phase 3 Sprint 1 Week 1 — catalog consolidation into cortex.memory.
--
-- Plan: docs/reference/aion-deal-chat-phase3-plan.md §3.1 (C1 atomic PR).
--
-- Why atomic:
--   After this migration runs, any in-flight call to `match_catalog` (from
--   palette / rider-parser / proposal-builder-studio) would error. Code
--   changes in the same PR replace those calls with `searchMemory(...,
--   { sourceTypes: ['catalog'] })` hitting cortex.match_memory. A no-op
--   wrapper for match_catalog (below) absorbs the tiny migration-to-deploy
--   window with an empty result instead of a 500 (belt + suspenders).
--
-- Data loss: all rows in public.catalog_embeddings are dropped.
--   Backfill path post-deploy:
--     1. Admin visits /catalog → "Backfill embeddings" button, or
--     2. Admin visits /settings/aion → "Backfill memory" (Sprint 0 admin
--        panel), which now also re-embeds catalog via the rewritten
--        catalog-embeddings.ts.
-- =============================================================================

-- ── 1. Drop all overloads of public.match_catalog ───────────────────────────
--
-- We iterate pg_proc because the historical signature used
-- `extensions.vector(1536)` but the live DB was altered to `vector(1024)`
-- without updating the function signature in git. This DO block drops
-- whatever signatures exist.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT oid::regprocedure AS sig
    FROM pg_proc
    WHERE proname = 'match_catalog'
      AND pronamespace = 'public'::regnamespace
  LOOP
    EXECUTE 'DROP FUNCTION ' || r.sig::text;
  END LOOP;
END
$$;


-- ── 2. Drop the embeddings table ────────────────────────────────────────────
--
-- CASCADE drops the dependent foreign key from public.packages (if any) and
-- any views that referenced the table. None exist today (verified via
-- information_schema.view_table_usage during Sprint 0).

DROP TABLE IF EXISTS public.catalog_embeddings CASCADE;


-- ── 3. No-op wrapper for any in-flight callers ──────────────────────────────
--
-- Returns an empty set with the shape the old function returned. Callers
-- that still reference `match_catalog` between this migration and the code
-- deploy will see "no matches" instead of a hard error. Safe to remove in a
-- follow-up migration after 7 days of no caller-side references in logs.

CREATE FUNCTION public.match_catalog(
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
AS $$
  SELECT NULL::uuid, NULL::text, NULL::float WHERE false;
$$;

COMMENT ON FUNCTION public.match_catalog IS
  'DEPRECATED no-op. Legacy catalog semantic search moved to cortex.memory (source_type=catalog). Remove after 7 days with zero call-site references.';

-- No grants — unused path, leave function callable only by roles that had
-- default EXECUTE (public). The no-op shape prevents data leakage either way.
