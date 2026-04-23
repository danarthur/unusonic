-- Phase A: Tokenized day sheet access for crew (no-login URL)
CREATE TABLE IF NOT EXISTS ops.day_sheet_tokens (
  token           uuid        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  event_id        uuid        NOT NULL REFERENCES ops.events(id) ON DELETE CASCADE,
  workspace_id    uuid        NOT NULL,
  deal_crew_id    uuid        REFERENCES ops.deal_crew(id) ON DELETE SET NULL,
  entity_id       uuid,
  email           text,
  expires_at      timestamptz NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS day_sheet_tokens_event_idx ON ops.day_sheet_tokens (event_id);
CREATE INDEX IF NOT EXISTS day_sheet_tokens_entity_idx ON ops.day_sheet_tokens (entity_id) WHERE entity_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS day_sheet_tokens_expires_idx ON ops.day_sheet_tokens (expires_at);

ALTER TABLE ops.day_sheet_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY day_sheet_tokens_select ON ops.day_sheet_tokens
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY day_sheet_tokens_insert ON ops.day_sheet_tokens
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY day_sheet_tokens_delete ON ops.day_sheet_tokens
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, DELETE ON ops.day_sheet_tokens TO authenticated;
