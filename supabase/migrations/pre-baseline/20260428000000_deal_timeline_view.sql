-- =============================================================================
-- Deal Timeline view — Phase 2 of Activity/Follow-up consolidation.
--
-- Unions ops.deal_activity_log + ops.follow_up_log into a single chronological
-- stream for the Deal Lens "Timeline" card. The underlying tables remain
-- unchanged — Daily Brief evaluators (insight-evaluators.ts,
-- gone-quiet-with-value.ts), Aion dispatch (dispatch-handlers.ts), and
-- embedding backfill (backfill-embeddings.ts) continue to read/write the base
-- tables directly. This is a read-side convenience only.
--
-- security_invoker = true → the view respects the caller's RLS on both base
-- tables, both of which already scope SELECT by get_my_workspace_ids().
-- =============================================================================

CREATE OR REPLACE VIEW ops.deal_timeline_v
WITH (security_invoker = true)
AS
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
  FROM ops.follow_up_log fl;

COMMENT ON VIEW ops.deal_timeline_v IS
  'Unified chronological stream for the Deal Lens Timeline card. Unions ops.deal_activity_log (trigger/system audit trail) with ops.follow_up_log (follow-up engine actions). Base tables unchanged — Daily Brief and Aion writers still target them directly. security_invoker=true respects caller RLS.';

GRANT SELECT ON ops.deal_timeline_v TO authenticated;
