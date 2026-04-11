-- Pass 3 Phase 3 — minimal domain event log.
--
-- This is the seam the Follow-Up Engine (deferred to a future pass) and any
-- future automation will subscribe to. Ships with exactly three event types
-- and refuses to extend without a design-doc update (Visionary risk #4:
-- "Phase 3 domain event table becomes dumping ground").
--
-- Writer: src/shared/lib/domain-events/publish-domain-event.ts (service role)
-- Current publishers:
--   - mark-show-state.ts::markShowStarted       -> 'show.started'
--   - mark-show-state.ts::markShowEnded         -> 'show.ended'
--   - (Phase 4) mark-show-wrapped.ts::markShowWrapped -> 'show.wrapped'
--
-- Readers: none today. The Follow-Up Engine (design doc complete, zero
-- implementation) will subscribe to 'show.ended' and 'show.wrapped' as its
-- textbook first automation triggers. Until then, this table is append-only
-- audit log.
--
-- RLS: SELECT-only for authenticated users scoped to their workspaces.
-- Writes are service-role only — the publisher helper uses getSystemClient()
-- so RLS doesn't need an INSERT policy.

CREATE TABLE IF NOT EXISTS ops.domain_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  event_id uuid NOT NULL REFERENCES ops.events(id) ON DELETE CASCADE,
  type text NOT NULL CHECK (type IN ('show.started', 'show.ended', 'show.wrapped')),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS domain_events_event_id_created_at_idx
  ON ops.domain_events (event_id, created_at DESC);

CREATE INDEX IF NOT EXISTS domain_events_workspace_type_created_at_idx
  ON ops.domain_events (workspace_id, type, created_at DESC);

ALTER TABLE ops.domain_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS domain_events_workspace_select ON ops.domain_events;
CREATE POLICY domain_events_workspace_select ON ops.domain_events
  FOR SELECT
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

-- No INSERT/UPDATE/DELETE policies. Writes only via service role from
-- src/shared/lib/domain-events/publish-domain-event.ts.
REVOKE INSERT, UPDATE, DELETE ON ops.domain_events FROM public, anon, authenticated;
GRANT SELECT ON ops.domain_events TO authenticated;
GRANT ALL ON ops.domain_events TO service_role;

COMMENT ON TABLE ops.domain_events IS
  'Pass 3 Phase 3: append-only log of show lifecycle events. Capped at three types (show.started, show.ended, show.wrapped). Adding a fourth requires a design-doc update and explicit approval per Pass 3 Visionary risk #4.';
