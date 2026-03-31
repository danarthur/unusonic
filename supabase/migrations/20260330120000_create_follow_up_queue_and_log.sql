-- Follow-Up Engine Phase 1: queue + log tables in ops schema

-- =============================================================================
-- ops.follow_up_queue
-- =============================================================================

CREATE TABLE ops.follow_up_queue (
  id               uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id     uuid        NOT NULL,
  deal_id          uuid        NOT NULL,
  priority_score   numeric     NOT NULL DEFAULT 0,
  reason           text        NOT NULL,
  reason_type      text        NOT NULL CHECK (reason_type IN (
    'stall', 'engagement_hot', 'deadline_proximity', 'no_owner', 'no_activity',
    'proposal_unseen', 'proposal_bounced'
  )),
  suggested_action text,
  suggested_channel text,
  context_snapshot jsonb,
  status           text        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'acted', 'snoozed', 'dismissed')),
  snoozed_until    timestamptz,
  acted_at         timestamptz,
  acted_by         uuid,
  created_at       timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX follow_up_queue_deal_uniq ON ops.follow_up_queue (deal_id)
  WHERE status IN ('pending', 'snoozed');

CREATE INDEX follow_up_queue_workspace_idx ON ops.follow_up_queue (workspace_id);
CREATE INDEX follow_up_queue_status_idx    ON ops.follow_up_queue (workspace_id, status);
CREATE INDEX follow_up_queue_priority_idx  ON ops.follow_up_queue (workspace_id, priority_score DESC)
  WHERE status = 'pending';

ALTER TABLE ops.follow_up_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY follow_up_queue_select ON ops.follow_up_queue FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY follow_up_queue_insert ON ops.follow_up_queue FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY follow_up_queue_update ON ops.follow_up_queue FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY follow_up_queue_delete ON ops.follow_up_queue FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.follow_up_queue TO authenticated;

-- =============================================================================
-- ops.follow_up_log
-- =============================================================================

CREATE TABLE ops.follow_up_log (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid        NOT NULL,
  deal_id         uuid        NOT NULL,
  actor_user_id   uuid,
  action_type     text        NOT NULL CHECK (action_type IN (
    'email_sent', 'sms_sent', 'call_logged', 'snoozed', 'dismissed', 'note_added',
    'system_queued', 'system_removed'
  )),
  channel         text        CHECK (channel IN ('sms', 'email', 'call', 'manual', 'system')),
  summary         text,
  content         text,
  queue_item_id   uuid,
  created_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX follow_up_log_deal_idx      ON ops.follow_up_log (deal_id);
CREATE INDEX follow_up_log_workspace_idx ON ops.follow_up_log (workspace_id);
CREATE INDEX follow_up_log_created_idx   ON ops.follow_up_log (deal_id, created_at DESC);

ALTER TABLE ops.follow_up_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY follow_up_log_select ON ops.follow_up_log FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY follow_up_log_insert ON ops.follow_up_log FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY follow_up_log_update ON ops.follow_up_log FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));
CREATE POLICY follow_up_log_delete ON ops.follow_up_log FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.follow_up_log TO authenticated;
