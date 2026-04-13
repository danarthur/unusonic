-- §3.2 Phase 1: Add timezone columns to workspaces and events
-- Research: R6 (event-timezone-storage-research.md) pinned Approach B:
--   timestamptz columns (already the case) + IANA timezone text column.
-- Verified 2026-04-11: neither table has a timezone column today.
-- Backfill: DEFAULT 'UTC' covers all existing rows (4 events, all venues lack tz attrs).

-- 1. Workspace fallback timezone (semantics: "fallback when venue tz is unknown")
ALTER TABLE public.workspaces
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';

-- 2. Per-event timezone (written at handoff from venue/workspace resolution chain)
ALTER TABLE ops.events
  ADD COLUMN timezone text NOT NULL DEFAULT 'UTC';

-- 3. IANA check constraint on events — accepts standard IANA paths like
--    America/New_York, Pacific/Auckland, Asia/Kolkata, plus bare 'UTC'.
--    Regex: one alpha segment, then 1-2 slash-separated segments of alpha/digit/underscore/hyphen/plus.
ALTER TABLE ops.events
  ADD CONSTRAINT events_timezone_iana
  CHECK (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$' OR timezone = 'UTC');

-- Same constraint on workspaces for consistency
ALTER TABLE public.workspaces
  ADD CONSTRAINT workspaces_timezone_iana
  CHECK (timezone ~ '^[A-Za-z]+(/[A-Za-z0-9_+-]+){1,2}$' OR timezone = 'UTC');

-- 4. Composite index for time-range queries that also need tz
CREATE INDEX events_starts_at_tz_idx ON ops.events (starts_at, timezone);

-- Audit note: RLS is inherited from existing row-level policies on both tables.
-- No new policies needed — the column is just a property of existing rows.
