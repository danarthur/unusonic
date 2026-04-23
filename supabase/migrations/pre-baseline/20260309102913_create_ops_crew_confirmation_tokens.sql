-- ============================================================
-- Phase 3: Crew Confirmation Tokens
-- One-time-use tokens for crew assignment confirmation emails.
-- Crew clicks confirm/decline in email → /confirm/[token] page
-- → consumeCrewToken() marks used and writes status back to
--   run_of_show_data.crew_items[crew_index].status
-- ============================================================

CREATE TABLE ops.crew_confirmation_tokens (
  token           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id        uuid        NOT NULL REFERENCES ops.events(id) ON DELETE CASCADE,
  crew_index      int         NOT NULL,
  entity_id       uuid        REFERENCES directory.entities(id) ON DELETE SET NULL,
  email           text        NOT NULL,
  role            text        NOT NULL,

  -- Lifecycle
  expires_at      timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  used_at         timestamptz,
  action_taken    text        CHECK (action_taken IN ('confirmed', 'declined')),

  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX crew_confirmation_tokens_event_id_idx  ON ops.crew_confirmation_tokens (event_id);
CREATE INDEX crew_confirmation_tokens_entity_id_idx ON ops.crew_confirmation_tokens (entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX crew_confirmation_tokens_expires_idx   ON ops.crew_confirmation_tokens (expires_at);

-- RLS: workspace members can read tokens for events in their workspace.
-- Writes are service-role only (system client) — never from the browser.
ALTER TABLE ops.crew_confirmation_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY crew_confirmation_tokens_select ON ops.crew_confirmation_tokens
  FOR SELECT USING (
    event_id IN (
      SELECT e.id FROM ops.events e
      JOIN ops.projects p ON p.id = e.project_id
      WHERE p.workspace_id IN (SELECT get_my_workspace_ids())
    )
  );
