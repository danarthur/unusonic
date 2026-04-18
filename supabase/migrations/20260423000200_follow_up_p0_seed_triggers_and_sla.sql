-- =============================================================================
-- Follow-Up Engine P0 — seed default triggers + dwell_sla evaluator
--
-- Two pieces:
--   1. Seeded default triggers on the workspace's 'sales' pipeline, matched
--      by stage.tags (not slug, kind, or sort_order). Workspaces that have
--      deleted or retagged a stage are treated as having opted out of that
--      specific trigger — the seed skips silently, never recreates.
--      Idempotent: re-running ORs the new triggers into the existing array
--      by primitive-key, so running this migration twice produces the same
--      final state.
--
--   2. `ops.evaluate_dwell_sla(p_batch_size)` — returns rows representing
--      stages where a deal has dwelled long enough to fire a `dwell_sla`
--      trigger. The dispatcher (server action) enrolls follow-ups for each
--      returned row; the same `(originating_transition_id, primitive_key)`
--      unique index from Migration 1 prevents double-insert on re-runs.
--
-- Reference: P0 plan, §1 table row for `proposal.dwell_sla` enrollment.
-- =============================================================================


-- =============================================================================
-- 1. ops.seed_default_triggers(p_workspace_id) — idempotent per-workspace seed
--
--    Sets `triggers` on the sales pipeline's stages that match the target
--    tags. Uses jsonb merge-by-primitive-key so re-running only appends new
--    primitive keys, never duplicates.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.seed_default_triggers(p_workspace_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_pipeline_id uuid;
  v_stage       RECORD;
  v_new_trigs   jsonb;
  v_existing    jsonb;
  v_merged      jsonb;
BEGIN
  -- Only seed on the workspace's default 'sales' pipeline.
  SELECT id INTO v_pipeline_id
    FROM ops.pipelines
   WHERE workspace_id = p_workspace_id
     AND slug = 'sales'
     AND is_default = true
   LIMIT 1;

  IF v_pipeline_id IS NULL THEN
    RETURN;
  END IF;

  -- Target triggers keyed by the tag that identifies the stage. Each entry
  -- is a JSONB array of trigger objects in the shape the dispatcher parses:
  --   { type, event, dwell_days?, config, primitive_key }
  --
  -- primitive_key is a stable, human-meaningful string that distinguishes
  -- multiple triggers of the same `type` (e.g. two enroll_in_follow_up
  -- triggers on a proposal stage — one check_in on_enter, one gone_quiet
  -- dwell_sla) in the merge step below, AND at enqueue time (the
  -- enroll_in_follow_up primitive uses it as the dedup key).
  FOR v_stage IN
    SELECT id, tags, triggers
      FROM ops.pipeline_stages
     WHERE pipeline_id = v_pipeline_id
  LOOP
    v_new_trigs := NULL;

    -- inquiry → 3-day nudge
    IF v_stage.tags @> ARRAY['initial_contact']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'enroll_in_follow_up',
          'event', 'on_enter',
          'primitive_key', 'seed:nudge_client',
          'config', jsonb_build_object(
            'reason_type', 'nudge_client',
            'dwell_days', 3,
            'channel', 'email'
          )
        )
      );
    END IF;

    -- proposal_sent → check-in (on_enter) + gone-quiet SLA (dwell_sla)
    IF v_stage.tags @> ARRAY['proposal_sent']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'enroll_in_follow_up',
          'event', 'on_enter',
          'primitive_key', 'seed:check_in',
          'config', jsonb_build_object(
            'reason_type', 'check_in',
            'dwell_days', 7,
            'channel', 'email'
          )
        ),
        jsonb_build_object(
          'type', 'enroll_in_follow_up',
          'event', 'dwell_sla',
          'dwell_days', 14,
          'primitive_key', 'seed:gone_quiet',
          'config', jsonb_build_object(
            'reason_type', 'gone_quiet',
            'dwell_days', 14,
            'priority_boost', 20
          )
        )
      );
    END IF;

    -- contract_out → owner task
    IF v_stage.tags @> ARRAY['contract_out']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'create_task',
          'event', 'on_enter',
          'primitive_key', 'seed:confirm_contract_sent',
          'config', jsonb_build_object(
            'title', 'Confirm contract sent',
            'assignee_rule', 'owner'
          )
        )
      );
    END IF;

    -- deposit_received → handoff wizard
    IF v_stage.tags @> ARRAY['deposit_received']::text[]
       OR v_stage.tags @> ARRAY['ready_for_handoff']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'trigger_handoff',
          'event', 'on_enter',
          'primitive_key', 'seed:open_handoff_wizard',
          'config', jsonb_build_object('open_wizard', true)
        )
      );
    END IF;

    -- won → client-visible thank-you (hide_from_portal=false means this
    -- one CAN be shown to the client if the owner wants).
    IF v_stage.tags @> ARRAY['won']::text[] THEN
      v_new_trigs := jsonb_build_array(
        jsonb_build_object(
          'type', 'enroll_in_follow_up',
          'event', 'on_enter',
          'primitive_key', 'seed:thank_you',
          'config', jsonb_build_object(
            'reason_type', 'thank_you',
            'dwell_days', 1,
            'hide_from_portal', false
          )
        )
      );
    END IF;

    IF v_new_trigs IS NULL THEN
      CONTINUE;
    END IF;

    -- Idempotent merge: for each target trigger, skip if an entry with the
    -- same primitive_key already exists; otherwise append. Preserves admin
    -- edits that added or renamed triggers on the stage.
    v_existing := COALESCE(v_stage.triggers, '[]'::jsonb);
    v_merged := v_existing;

    FOR i IN 0..(jsonb_array_length(v_new_trigs) - 1) LOOP
      IF NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(v_merged) ex
        WHERE ex->>'primitive_key' = v_new_trigs->i->>'primitive_key'
      ) THEN
        v_merged := v_merged || jsonb_build_array(v_new_trigs->i);
      END IF;
    END LOOP;

    IF v_merged IS DISTINCT FROM v_existing THEN
      UPDATE ops.pipeline_stages
         SET triggers = v_merged,
             updated_at = now()
       WHERE id = v_stage.id;
    END IF;
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.seed_default_triggers(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.seed_default_triggers(uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION ops.seed_default_triggers(uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION ops.seed_default_triggers(uuid) TO service_role;

COMMENT ON FUNCTION ops.seed_default_triggers(uuid) IS
  'P0: seed default follow-up triggers on the workspace sales pipeline. Matches stages by tags (not slug/label), so renamed or customized stages that still carry the semantic tag receive the trigger. Workspaces that deleted a tagged stage are silently skipped (no recreation). Idempotent: re-running merges on primitive_key without duplicating.';


-- =============================================================================
-- 2. Backfill — apply the seed to every existing workspace
-- =============================================================================

DO $$
DECLARE
  v_workspace RECORD;
BEGIN
  FOR v_workspace IN SELECT id FROM public.workspaces LOOP
    PERFORM ops.seed_default_triggers(v_workspace.id);
  END LOOP;
END;
$$;


-- =============================================================================
-- 3. Auto-seed triggers when a new workspace's sales pipeline is created
--
--    The existing `trg_seed_default_pipeline_on_workspace` fires
--    seed_default_pipeline AFTER INSERT on public.workspaces. We chain
--    seed_default_triggers off that so new workspaces pick up the defaults.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.seed_default_pipeline_on_workspace_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
BEGIN
  PERFORM ops.seed_default_pipeline(NEW.id);
  PERFORM ops.seed_default_triggers(NEW.id);
  RETURN NEW;
END;
$$;

-- Trigger itself already exists; CREATE OR REPLACE on the function is enough.


-- =============================================================================
-- 4. ops.evaluate_dwell_sla(p_batch_size) — returns SLA work to dispatch
--
--    For each (deal, stage) pair where:
--      • deal's latest transition landed in a stage with a `dwell_sla`
--        trigger whose `dwell_days` has elapsed
--      • the trigger's enrollment hasn't already been recorded
--        (no ops.follow_up_queue row with the synthetic
--         `dwell_sla:<transition_id>:<primitive_key>` key)
--    returns a synthetic row the enrolling dispatcher can process.
--
--    Batching: the dispatcher's own per-run SLA cron picks up at most
--    p_batch_size rows so a bad SLA trigger can't flood the queue.
--
--    SECURITY DEFINER, service-role only.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.evaluate_dwell_sla(
  p_batch_size integer DEFAULT 100
)
RETURNS TABLE (
  transition_id    uuid,
  workspace_id     uuid,
  deal_id          uuid,
  pipeline_id      uuid,
  to_stage_id      uuid,
  stage_tags       text[],
  trigger_payload  jsonb
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ops
AS $$
  WITH latest AS (
    SELECT DISTINCT ON (t.deal_id)
           t.id           AS transition_id,
           t.workspace_id,
           t.deal_id,
           t.pipeline_id,
           t.to_stage_id,
           t.entered_at,
           t.triggers_snapshot,
           s.triggers     AS live_triggers,
           s.tags         AS stage_tags
      FROM ops.deal_transitions t
      JOIN ops.pipeline_stages  s ON s.id = t.to_stage_id
      JOIN public.deals         d ON d.id = t.deal_id
      JOIN public.workspaces    w ON w.id = t.workspace_id
     WHERE d.archived_at IS NULL
       AND d.status = 'working'
       AND (w.feature_flags ->> 'pipelines.triggers_enabled')::boolean IS TRUE
     ORDER BY t.deal_id, t.entered_at DESC
  ),
  expanded AS (
    SELECT l.transition_id,
           l.workspace_id,
           l.deal_id,
           l.pipeline_id,
           l.to_stage_id,
           l.stage_tags,
           l.entered_at,
           trg
      FROM latest l,
           LATERAL jsonb_array_elements(
             COALESCE(l.triggers_snapshot, l.live_triggers)
           ) AS trg
     WHERE trg->>'event' = 'dwell_sla'
       AND (trg->>'dwell_days')::int IS NOT NULL
       AND l.entered_at <= now() - make_interval(days => (trg->>'dwell_days')::int)
  )
  SELECT e.transition_id,
         e.workspace_id,
         e.deal_id,
         e.pipeline_id,
         e.to_stage_id,
         e.stage_tags,
         e.trg AS trigger_payload
    FROM expanded e
   WHERE NOT EXISTS (
           -- Idempotency: don't return SLA work already enrolled.
           SELECT 1
             FROM ops.follow_up_queue q
            WHERE q.originating_transition_id = e.transition_id
              AND q.primitive_key = 'sla:' || (e.trg->>'primitive_key')
         )
   ORDER BY e.entered_at ASC
   LIMIT GREATEST(p_batch_size, 1);
$$;

REVOKE EXECUTE ON FUNCTION ops.evaluate_dwell_sla(integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.evaluate_dwell_sla(integer) FROM anon;
REVOKE EXECUTE ON FUNCTION ops.evaluate_dwell_sla(integer) FROM authenticated;
GRANT EXECUTE ON FUNCTION ops.evaluate_dwell_sla(integer) TO service_role;

COMMENT ON FUNCTION ops.evaluate_dwell_sla(integer) IS
  'P0: returns deals whose current stage has a dwell_sla trigger past its dwell_days threshold and has not yet been enrolled. Idempotent via ops.follow_up_queue.originating_transition_id + primitive_key (prefixed sla:). Service-role only.';
