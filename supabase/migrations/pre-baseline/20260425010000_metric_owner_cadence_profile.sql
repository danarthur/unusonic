-- =============================================================================
-- Owner-cadence profile metric (Fork C, Phase 2, Ext B)
--
-- Aggregates a single user's follow-up cadence patterns for personalizing
-- Aion's deal-card voice + priority. Keyed per-user per-archetype — never
-- cross-seat, never cross-event-type (per Critic P0-3 + P1-2 in
-- docs/reference/aion-deal-card-unified-design.md §20).
--
-- Feedback-loop guard (Critic P0-2): excludes follow-up acts that were
-- triggered by an Aion-enrolled queue item. Human-initiated = queue_item_id
-- IS NULL OR the queue row's linked_insight_id IS NULL. This keeps the
-- profile from training on its own output.
--
-- Output shape is raw metrics; the "sample_quality" gate (n>=20, cv<0.5,
-- max_age<180d) is applied client-side in src/shared/lib/owner-cadence.ts
-- so that logs + audit trails see the underlying numbers.
--
-- Service-role only — app code calls via metrics library from server
-- actions that have already validated workspace membership + opt-in flag.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.metric_owner_cadence_profile(
  p_workspace_id    uuid,
  p_user_id         uuid,
  p_archetype       text,
  p_lookback_days   integer DEFAULT 180
)
RETURNS TABLE (
  sample_size                              integer,
  typical_days_proposal_to_first_followup  numeric,
  stddev_days_proposal_to_first_followup   numeric,
  typical_days_between_followups           numeric,
  stddev_days_between_followups            numeric,
  preferred_channel_by_stage_tag           jsonb,
  oldest_sample_age_days                   integer,
  computed_at                              timestamptz
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public, ops
AS $$
  WITH lookback AS (
    SELECT (now() - (GREATEST(p_lookback_days, 30)::text || ' days')::interval) AS cutoff
  ),

  -- Deals in scope: owned by this user, matching archetype, within lookback window.
  -- Archetype normalization: 'wedding' / 'corporate' / 'tour' / 'other'.
  scope_deals AS (
    SELECT
      d.id AS deal_id,
      CASE
        WHEN lower(COALESCE(d.event_archetype, '')) IN ('wedding', 'corporate', 'tour')
          THEN lower(d.event_archetype)
        ELSE 'other'
      END AS archetype
    FROM public.deals d, lookback
    WHERE d.workspace_id = p_workspace_id
      AND d.owner_user_id = p_user_id
      AND d.created_at >= lookback.cutoff
      AND (
        CASE
          WHEN lower(COALESCE(d.event_archetype, '')) IN ('wedding', 'corporate', 'tour')
            THEN lower(d.event_archetype)
          ELSE 'other'
        END
      ) = p_archetype
  ),

  -- Human-initiated follow-up acts: created by this user, not via an Aion
  -- queue item (feedback-loop guard). Acts that DO have a queue_item_id but
  -- whose queue row has linked_insight_id IS NULL are still human — Aion
  -- didn't drive them.
  human_acts AS (
    SELECT
      l.deal_id,
      l.actor_user_id,
      l.action_type,
      l.channel,
      l.created_at,
      sd.archetype
    FROM ops.follow_up_log l
    JOIN scope_deals sd ON sd.deal_id = l.deal_id
    LEFT JOIN ops.follow_up_queue q ON q.id = l.queue_item_id
    WHERE l.workspace_id = p_workspace_id
      AND l.actor_user_id = p_user_id
      AND l.action_type IN ('email_sent', 'sms_sent', 'call_logged', 'note_added')
      AND (q.id IS NULL OR q.linked_insight_id IS NULL)  -- feedback-loop guard
  ),

  -- Proposal-send timestamps per deal. Prefer email_delivered_at (Resend
  -- confirmation); fall back to created_at for hand-delivered proposals.
  proposal_send AS (
    SELECT DISTINCT ON (p.deal_id)
      p.deal_id,
      COALESCE(p.email_delivered_at, p.created_at) AS sent_at
    FROM public.proposals p
    JOIN scope_deals sd ON sd.deal_id = p.deal_id
    WHERE p.workspace_id = p_workspace_id
      AND p.status IN ('sent', 'viewed', 'accepted', 'rejected')
    ORDER BY p.deal_id, p.created_at ASC
  ),

  -- First human-initiated follow-up after proposal send, per deal.
  first_followup AS (
    SELECT
      ps.deal_id,
      ps.sent_at,
      MIN(ha.created_at) AS first_act_at,
      EXTRACT(EPOCH FROM (MIN(ha.created_at) - ps.sent_at)) / 86400.0 AS days_delta
    FROM proposal_send ps
    JOIN human_acts ha ON ha.deal_id = ps.deal_id
    WHERE ha.created_at > ps.sent_at
    GROUP BY ps.deal_id, ps.sent_at
  ),

  -- Gaps between consecutive human-initiated acts on the same deal.
  act_gaps AS (
    SELECT
      ha.deal_id,
      ha.created_at,
      EXTRACT(EPOCH FROM (
        ha.created_at - LAG(ha.created_at) OVER (PARTITION BY ha.deal_id ORDER BY ha.created_at)
      )) / 86400.0 AS gap_days
    FROM human_acts ha
  ),

  -- Preferred channel per stage tag (computed from acts joined to deal's
  -- stage at act-time — approximated by the deal's current stage tags;
  -- rigorous per-transition lookup deferred to a later pass).
  channel_by_stage AS (
    SELECT
      COALESCE(s.tags, ARRAY[]::text[]) AS stage_tags,
      ha.channel,
      COUNT(*) AS n
    FROM human_acts ha
    JOIN public.deals d ON d.id = ha.deal_id
    LEFT JOIN ops.pipeline_stages s ON s.id = d.stage_id
    WHERE ha.channel IS NOT NULL
    GROUP BY COALESCE(s.tags, ARRAY[]::text[]), ha.channel
  ),

  channel_winner_per_tag AS (
    SELECT
      tag,
      channel,
      n,
      ROW_NUMBER() OVER (PARTITION BY tag ORDER BY n DESC) AS rnk
    FROM (
      SELECT unnest(stage_tags) AS tag, channel, n FROM channel_by_stage
    ) t
  ),

  preferred_channels AS (
    SELECT COALESCE(jsonb_object_agg(tag, channel), '{}'::jsonb) AS m
    FROM channel_winner_per_tag
    WHERE rnk = 1
  )

  SELECT
    COALESCE((SELECT COUNT(*)::integer FROM human_acts), 0) AS sample_size,

    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY days_delta)
     FROM first_followup WHERE days_delta IS NOT NULL) AS typical_days_proposal_to_first_followup,

    (SELECT stddev_pop(days_delta) FROM first_followup WHERE days_delta IS NOT NULL)
      AS stddev_days_proposal_to_first_followup,

    (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY gap_days)
     FROM act_gaps WHERE gap_days IS NOT NULL) AS typical_days_between_followups,

    (SELECT stddev_pop(gap_days) FROM act_gaps WHERE gap_days IS NOT NULL)
      AS stddev_days_between_followups,

    (SELECT m FROM preferred_channels) AS preferred_channel_by_stage_tag,

    COALESCE(
      (SELECT EXTRACT(DAY FROM (now() - MIN(created_at)))::integer FROM human_acts),
      0
    ) AS oldest_sample_age_days,

    now() AS computed_at;
$$;

REVOKE EXECUTE ON FUNCTION ops.metric_owner_cadence_profile(uuid, uuid, text, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION ops.metric_owner_cadence_profile(uuid, uuid, text, integer)
  TO service_role;

COMMENT ON FUNCTION ops.metric_owner_cadence_profile(uuid, uuid, text, integer) IS
  'Owner-cadence analytics for a single user+archetype. Returns raw metrics; "sample_quality" gate (n>=20, stddev/mean<0.5, age<180d) is applied client-side. Human-initiated acts only (queue_item_id NULL or linked_insight_id NULL) — prevents feedback-loop pollution per design doc §20.4. Service-role only. See docs/reference/aion-deal-card-unified-design.md §20 and src/shared/lib/owner-cadence.ts.';