-- Pass 3 Phase 4 — archived_at as the canonical "show is wrapped, get it
-- out of the active piles" signal.
--
-- Writer: src/app/(dashboard)/(features)/crm/actions/mark-show-wrapped.ts
--   (new in Phase 4). Sets archived_at, flips status to 'archived',
--   flips lifecycle_status to 'archived', publishes 'show.wrapped' event.
--
-- Read helper: src/shared/lib/event-status/get-active-events-filter.ts
--   Every CRM stream / Lobby / Follow-Up reader should call
--   applyActiveEventsFilter(query) instead of directly touching archived_at.
--   Finance, Venue history, Employee Portal pay history, and cortex.memory
--   explicitly DO NOT filter by archived_at — they need to see the full
--   history. See the helper's allowlist comment for the canonical consumer list.
--
-- Phase 0's pair-valid trigger already guarantees status='archived' ↔
-- lifecycle_status='archived', so we do NOT add a redundant CHECK coupling
-- archived_at to those values here — future payroll or backfill paths
-- might legitimately set archived_at without re-firing the lifecycle check.
--
-- Adding a nullable column with no default is metadata-only on Postgres 15
-- (Supabase's version) — no rewrite, no long lock.

ALTER TABLE ops.events
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;

-- Partial index on the active subset. Makes the canonical
-- applyActiveEventsFilter query effectively free regardless of how many
-- archived rows accumulate over time.
CREATE INDEX IF NOT EXISTS events_active_workspace_starts_at_idx
  ON ops.events (workspace_id, starts_at DESC)
  WHERE archived_at IS NULL;

COMMENT ON COLUMN ops.events.archived_at IS
  'Pass 3 Phase 4: set by markShowWrapped() in src/app/(dashboard)/(features)/crm/actions/mark-show-wrapped.ts. NULL = show is still in active piles (CRM Stream, Lobby, Follow-Up). NOT NULL = wrapped and removed from active surfaces. Finance / Venue history / Employee Portal pay history / cortex.memory explicitly do NOT filter by this column — see src/shared/lib/event-status/get-active-events-filter.ts for the allowlist.';
