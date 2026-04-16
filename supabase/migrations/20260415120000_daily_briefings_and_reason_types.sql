-- Phase 2: Daily briefings table + expanded reason_type CHECK
-- Supports the Today's Brief card and new follow-up signals:
-- draft_aging, deposit_overdue, unsigned, dormant_client.

-- ── 1. Daily briefings table ────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS ops.daily_briefings (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  user_id          uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  generated_at     timestamptz NOT NULL DEFAULT now(),
  body             text        NOT NULL DEFAULT '',
  facts_json       jsonb       NOT NULL DEFAULT '{}',
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_daily_briefings_ws_date
  ON ops.daily_briefings (workspace_id, generated_at DESC);

ALTER TABLE ops.daily_briefings ENABLE ROW LEVEL SECURITY;

CREATE POLICY daily_briefings_select ON ops.daily_briefings
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY daily_briefings_insert ON ops.daily_briefings
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT ON ops.daily_briefings TO authenticated;
GRANT ALL ON ops.daily_briefings TO service_role;

ALTER DEFAULT PRIVILEGES IN SCHEMA ops
  GRANT ALL ON TABLES TO service_role;

-- ── 2. Expand reason_type CHECK ─────────────────────────────────────────────

ALTER TABLE ops.follow_up_queue
  DROP CONSTRAINT IF EXISTS follow_up_queue_reason_type_check;

ALTER TABLE ops.follow_up_queue
  ADD CONSTRAINT follow_up_queue_reason_type_check
  CHECK (reason_type IN (
    'stall', 'engagement_hot', 'deadline_proximity', 'no_owner', 'no_activity',
    'proposal_unseen', 'proposal_bounced', 'proposal_sent', 'date_hold_pressure',
    'draft_aging', 'deposit_overdue', 'unsigned', 'dormant_client'
  ));
