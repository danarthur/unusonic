-- =============================================================================
-- Proposal Builder rebuild — kill-criteria dashboard queries
--
-- Run in the Supabase SQL editor. Each query answers one of the five
-- metrics from docs/reference/proposal-builder-rebuild-design.md §4.4.
-- With Phase 2 shipped, every workspace is on the `palette` variant; use
-- the time window and any post-handoff workspace segmentation you need.
--
-- Replace :since / :until with a date range (default: last 30 days).
-- =============================================================================

-- ─── 1. Time-to-first-line-item (p50, p90) by variant ────────────────────────
-- Phase 1 target: palette p50 ≥10% faster than drag p50.
-- After Phase 2 ships, only `palette` rows exist — compare against the last
-- 30 days of Phase 1 drag data stored as historical baseline.

SELECT
  variant,
  COUNT(*)                                                           AS sessions_with_first_add,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY (payload->>'elapsed_ms')::int) AS p50_ms,
  percentile_cont(0.90) WITHIN GROUP (ORDER BY (payload->>'elapsed_ms')::int) AS p90_ms
FROM ops.proposal_builder_events
WHERE type = 'first_add'
  AND created_at >= now() - interval '30 days'
GROUP BY variant
ORDER BY variant;


-- ─── 2. Palette opens per session (distribution) ─────────────────────────────
-- Phase 1 instrumentation; informs how often power users reach for ⌘K vs
-- click the sticky "+" button.

WITH session_opens AS (
  SELECT
    session_id,
    COUNT(*)                                          AS opens,
    COUNT(*) FILTER (WHERE payload->>'source' = 'shortcut') AS via_shortcut,
    COUNT(*) FILTER (WHERE payload->>'source' = 'button')   AS via_button
  FROM ops.proposal_builder_events
  WHERE type = 'palette_open'
    AND created_at >= now() - interval '30 days'
  GROUP BY session_id
)
SELECT
  ROUND(AVG(opens)::numeric, 2)      AS mean_opens_per_session,
  percentile_cont(0.50) WITHIN GROUP (ORDER BY opens) AS median_opens_per_session,
  ROUND(AVG(via_shortcut * 1.0 / NULLIF(opens, 0))::numeric, 2) AS avg_share_via_shortcut,
  ROUND(AVG(via_button * 1.0 / NULLIF(opens, 0))::numeric, 2)   AS avg_share_via_button,
  COUNT(*)                           AS sessions
FROM session_opens;


-- ─── 3. Add-success distribution: drag vs palette vs custom ─────────────────
-- After Phase 2, drag should be zero (studio deleted). Custom vs palette
-- tells us how often catalog-less line items are used.

SELECT
  variant,
  payload->>'source' AS source,
  COUNT(*)           AS adds
FROM ops.proposal_builder_events
WHERE type = 'add_success'
  AND created_at >= now() - interval '30 days'
GROUP BY variant, source
ORDER BY variant, source;


-- ─── 4. Row reorder usage (Phase 2 kill criterion) ──────────────────────────
-- Design-doc target: >10% of proposal sessions end up reordering at least
-- one row. Confirms we still need drag on the receipt.
-- `payload->>'from_group_index'` / `'to_group_index'` are indices into the
-- sortable-group list (ungrouped items occupy their own group), NOT into
-- proposal_items.sort_order. Useful for debugging misfires only.

WITH sessions AS (
  SELECT DISTINCT session_id, variant
  FROM ops.proposal_builder_events
  WHERE created_at >= now() - interval '30 days'
),
reorder_sessions AS (
  SELECT DISTINCT session_id
  FROM ops.proposal_builder_events
  WHERE type = 'row_reorder'
    AND created_at >= now() - interval '30 days'
)
SELECT
  s.variant,
  COUNT(*)                                         AS sessions,
  COUNT(*) FILTER (WHERE r.session_id IS NOT NULL) AS sessions_with_reorder,
  ROUND(
    COUNT(*) FILTER (WHERE r.session_id IS NOT NULL) * 100.0 / NULLIF(COUNT(*), 0),
    1
  ) AS pct_sessions_with_reorder
FROM sessions s
LEFT JOIN reorder_sessions r USING (session_id)
GROUP BY s.variant
ORDER BY s.variant;


-- ─── 5. Session volume by variant ────────────────────────────────────────────
-- Baseline denominator; useful when the others look weird.

SELECT
  variant,
  COUNT(DISTINCT session_id) AS sessions,
  COUNT(DISTINCT user_id)    AS unique_users,
  COUNT(DISTINCT deal_id)    AS unique_deals
FROM ops.proposal_builder_events
WHERE type = 'session_start'
  AND created_at >= now() - interval '30 days'
GROUP BY variant
ORDER BY variant;
