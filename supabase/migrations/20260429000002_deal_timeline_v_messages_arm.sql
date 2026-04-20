-- =============================================================================
-- Replies — Phase 1 P0 #3
--
-- Extends ops.deal_timeline_v with a third UNION ALL arm that surfaces
-- ops.messages rows alongside activity_log and follow_up_log entries. The
-- Deal Lens Timeline card now renders inbound + outbound messages in-line
-- with system events, keyed on thread + deal.
--
-- Security invariants unchanged:
--   • CREATE OR REPLACE VIEW — idempotent, no data loss
--   • security_invoker = true — caller's RLS on each base table applies
--   • ops.messages has the standard workspace-scoped SELECT policy, so the
--     UNION inherits correct visibility
--
-- Downstream readers (get-deal-timeline.ts) already accept a free-form
-- metadata jsonb column, so adding message-specific fields there costs
-- nothing on the client side beyond extending the actor_kind / source
-- discriminator unions.
-- =============================================================================

CREATE OR REPLACE VIEW ops.deal_timeline_v
WITH (security_invoker = true)
AS
  -- ── 1. deal_activity_log (unchanged from original) ─────────────────────
  SELECT
    al.id,
    'activity'::text                              AS source,
    al.workspace_id,
    al.deal_id,
    al.actor_kind,
    al.actor_user_id,
    al.action_summary,
    al.status,
    al.error_message,
    al.trigger_type,
    NULL::text                                    AS action_type,
    NULL::text                                    AS channel,
    al.undo_token,
    al.undone_at,
    al.metadata,
    al.created_at
  FROM ops.deal_activity_log al

  UNION ALL

  -- ── 2. follow_up_log (unchanged from original) ────────────────────────
  SELECT
    fl.id,
    'follow_up'::text                             AS source,
    fl.workspace_id,
    fl.deal_id,
    CASE
      WHEN fl.channel = 'system'          THEN 'system'
      WHEN fl.actor_user_id IS NOT NULL   THEN 'user'
      ELSE 'system'
    END::text                                     AS actor_kind,
    fl.actor_user_id,
    COALESCE(fl.summary, fl.action_type)          AS action_summary,
    'success'::text                               AS status,
    NULL::text                                    AS error_message,
    NULL::text                                    AS trigger_type,
    fl.action_type,
    fl.channel,
    NULL::text                                    AS undo_token,
    NULL::timestamptz                             AS undone_at,
    jsonb_build_object(
      'content',             fl.content,
      'queue_item_id',       fl.queue_item_id,
      'edit_classification', fl.edit_classification,
      'edit_distance',       fl.edit_distance
    )                                             AS metadata,
    fl.created_at
  FROM ops.follow_up_log fl

  UNION ALL

  -- ── 3. messages (NEW) ─────────────────────────────────────────────────
  -- Only surfaces messages whose thread is bound to a deal. Unresolved /
  -- deal-less threads appear in /replies/unresolved, not on a deal timeline.
  SELECT
    m.id,
    'message'::text                               AS source,
    m.workspace_id,
    mt.deal_id,
    CASE
      WHEN m.direction = 'inbound'  THEN 'client'
      WHEN m.sent_by_user_id IS NOT NULL THEN 'user'
      ELSE 'system'
    END::text                                     AS actor_kind,
    m.sent_by_user_id                             AS actor_user_id,
    -- Short action summary for the Timeline card row. Full body rendered on
    -- the Replies card via message_id deep link in metadata.
    CASE
      WHEN m.direction = 'inbound' THEN
        CASE m.channel
          WHEN 'email' THEN 'Received email'
          WHEN 'sms'   THEN 'Received text message'
          ELSE            'Received message'
        END
      ELSE
        CASE m.channel
          WHEN 'email' THEN 'Sent email'
          WHEN 'sms'   THEN 'Sent text message'
          ELSE            'Sent message'
        END
    END                                           AS action_summary,
    'success'::text                               AS status,
    NULL::text                                    AS error_message,
    NULL::text                                    AS trigger_type,
    -- action_type mirrors follow_up_log's convention so downstream filtering
    -- works without special-casing.
    CASE
      WHEN m.direction = 'inbound' AND m.channel = 'email' THEN 'email_received'
      WHEN m.direction = 'inbound' AND m.channel = 'sms'   THEN 'sms_received'
      WHEN m.direction = 'outbound' AND m.channel = 'email' THEN 'email_sent'
      WHEN m.direction = 'outbound' AND m.channel = 'sms'   THEN 'sms_sent'
      ELSE NULL
    END                                           AS action_type,
    m.channel,
    NULL::text                                    AS undo_token,
    NULL::timestamptz                             AS undone_at,
    -- Metadata carries the handles the client needs to deep-link into the
    -- Replies card for the full body.
    jsonb_build_object(
      'message_id',             m.id,
      'thread_id',              m.thread_id,
      'direction',              m.direction,
      'subject',                mt.subject,
      'from_address',           m.from_address,
      'from_entity_id',         m.from_entity_id,
      'body_preview',           LEFT(COALESCE(m.body_text, ''), 160),
      'urgency_keyword_match',  m.urgency_keyword_match,
      'ai_classification',      m.ai_classification
    )                                             AS metadata,
    m.created_at
  FROM ops.messages m
  JOIN ops.message_threads mt ON mt.id = m.thread_id
  WHERE mt.deal_id IS NOT NULL;

COMMENT ON VIEW ops.deal_timeline_v IS
  'Unified chronological stream for the Deal Lens Timeline card. Unions ops.deal_activity_log, ops.follow_up_log, and ops.messages (thread-bound to a deal). Base tables unchanged; security_invoker=true respects caller RLS.';

GRANT SELECT ON ops.deal_timeline_v TO authenticated;
