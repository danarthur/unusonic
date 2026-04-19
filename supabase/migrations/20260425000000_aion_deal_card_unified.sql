-- =============================================================================
-- Aion Deal Card — Unified (Fork C, Phase 1)
--
-- Wires the follow-up queue and aion_insights together so the unified
-- deal-page card can read both from a single joined query, while keeping
-- the two evaluation pipelines independent.
--
-- See `docs/reference/aion-deal-card-unified-design.md` for the full spec.
--
-- This migration is idempotent (IF NOT EXISTS everywhere).
--
-- Changes:
--   1. Add ops.follow_up_queue.linked_insight_id FK to cortex.aion_insights.
--      ON DELETE SET NULL — historical breadcrumb, not liveness. The card
--      reader enforces liveness via status filter (§8.3a of design).
--
--   2. Add cortex.aion_insights.hide_from_portal boolean DEFAULT true.
--      Prophylactic — no portal reader today but closes the landmine before
--      client portal ships. Mirrors ops.follow_up_queue.hide_from_portal.
--
--   3. Create cortex.portal_aion_insights view with
--      security_invoker = true, security_barrier = true, filtered to
--      hide_from_portal=false AND status IN ('pending','surfaced'). Portal
--      routes read this view; raw table stays workspace-RLS-gated.
--
--   4. Add ops.deal_transitions.suggestion_insight_id FK — records which
--      insight motivated an Aion-suggested stage advance. Lives on the
--      transition row so audit logs stay truthful: actor_kind='user' when
--      owner clicked, suggestion_insight_id carries the Aion provenance.
--
--   5. Update public.record_deal_transition trigger function to read three
--      session-local GUC settings:
--        - unusonic.aion_suggestion_id       → stamps suggestion_insight_id
--        - unusonic.actor_kind_override      → overrides actor_kind
--        - unusonic.actor_user_id_override   → overrides actor_user_id (needed
--          because the wrapper is SECURITY DEFINER called via service_role;
--          auth.uid() returns NULL in that context so the originating user
--          must be threaded explicitly)
--      All settings are SET LOCAL (transaction-scoped) and clear automatically.
--
--   6. Create ops.record_deal_transition_with_actor(p_deal_id, p_to_stage_id,
--      p_actor_kind, p_actor_id, p_reason, p_suggestion_insight_id) — the RPC
--      that server actions call when Aion-suggested advances are accepted.
--      Sets the session GUCs, updates public.deals.stage_id (which fires the
--      existing trigger), returns the new transition_id. Noop when deal is
--      already at the target stage.
-- =============================================================================


-- =============================================================================
-- 1. ops.follow_up_queue.linked_insight_id (FK breadcrumb)
-- =============================================================================

ALTER TABLE ops.follow_up_queue
  ADD COLUMN IF NOT EXISTS linked_insight_id uuid
  REFERENCES cortex.aion_insights(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_follow_up_queue_linked_insight
  ON ops.follow_up_queue(linked_insight_id)
  WHERE linked_insight_id IS NOT NULL;

COMMENT ON COLUMN ops.follow_up_queue.linked_insight_id IS
  'Historical breadcrumb: the cortex.aion_insights row that preceded this follow-up, if any. Stamped by the enroll_in_follow_up primitive. ON DELETE SET NULL only fires on row DELETE — resolution (status=resolved) does NOT clear the link. Liveness is enforced at read time via status filter. See docs/reference/aion-deal-card-unified-design.md §8.3a.';


-- =============================================================================
-- 2. cortex.aion_insights.hide_from_portal (prophylactic landmine closure)
-- =============================================================================

ALTER TABLE cortex.aion_insights
  ADD COLUMN IF NOT EXISTS hide_from_portal boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_aion_insights_portal_visible
  ON cortex.aion_insights(workspace_id, status)
  WHERE hide_from_portal = false;

COMMENT ON COLUMN cortex.aion_insights.hide_from_portal IS
  'Audience flag. TRUE (default) = internal-only; owner sees it in dashboard + brief but client/employee portal readers never do. Mirrors ops.follow_up_queue.hide_from_portal. Primary enforcement is via cortex.portal_aion_insights view + ESLint no-restricted-imports on portal code.';


-- =============================================================================
-- 3. cortex.portal_aion_insights (portal-safe read view)
-- =============================================================================

-- Drop first so we can CREATE without fighting CREATE OR REPLACE WITH options.
DROP VIEW IF EXISTS cortex.portal_aion_insights;

CREATE VIEW cortex.portal_aion_insights
  WITH (security_invoker = true, security_barrier = true) AS
  SELECT *
  FROM cortex.aion_insights
  WHERE hide_from_portal = false
    AND status IN ('pending', 'surfaced');

GRANT SELECT ON cortex.portal_aion_insights TO authenticated;

COMMENT ON VIEW cortex.portal_aion_insights IS
  'Portal-safe subset of cortex.aion_insights. security_invoker=true so RLS on the underlying table runs as the caller (workspace membership). Filtered to hide_from_portal=false and active status. Portal routes read this view; raw table stays workspace-RLS-gated for dashboard code.';


-- =============================================================================
-- 4. ops.deal_transitions.suggestion_insight_id (Aion provenance)
-- =============================================================================

ALTER TABLE ops.deal_transitions
  ADD COLUMN IF NOT EXISTS suggestion_insight_id uuid
  REFERENCES cortex.aion_insights(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_deal_transitions_suggestion_insight
  ON ops.deal_transitions(suggestion_insight_id)
  WHERE suggestion_insight_id IS NOT NULL;

COMMENT ON COLUMN ops.deal_transitions.suggestion_insight_id IS
  'When set, records the cortex.aion_insights row that motivated this transition (Aion suggestion accepted). actor_kind still reflects who clicked (usually user); suggestion_insight_id is the provenance layer. Set via session GUC unusonic.aion_suggestion_id by ops.record_deal_transition_with_actor.';


-- =============================================================================
-- 5. Extend record_deal_transition trigger — read session GUCs
--
-- The trigger function is already SECURITY DEFINER with search_path pinned
-- (migration 20260423000100). We keep that shape and extend it to:
--   - Read current_setting('unusonic.aion_suggestion_id', true) → stamp
--     suggestion_insight_id on the new transition row.
--   - Read current_setting('unusonic.actor_kind_override', true) → override
--     the derived actor_kind when the caller wants 'aion' or 'system' instead
--     of the auth.uid()-derived default.
--
-- current_setting(…, true) returns NULL when the setting is unset — that's
-- the no-op case; existing callers (Stripe webhook, pipeline dispatcher) are
-- unaffected.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_deal_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_actor_user        uuid;
  v_actor_kind        text;
  v_actor_override    text;
  v_user_override     uuid;
  v_suggestion_id     uuid;
  v_triggers          jsonb;
  v_new_transition_id uuid;
BEGIN
  BEGIN
    v_actor_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_user := NULL;
  END;
  v_actor_kind := CASE WHEN v_actor_user IS NULL THEN 'system' ELSE 'user' END;

  -- Session-local overrides (NULL when unset; no-op for existing callers)
  BEGIN
    v_actor_override := NULLIF(current_setting('unusonic.actor_kind_override', true), '');
  EXCEPTION WHEN OTHERS THEN
    v_actor_override := NULL;
  END;
  IF v_actor_override IN ('user', 'aion', 'system') THEN
    v_actor_kind := v_actor_override;
  END IF;

  BEGIN
    v_user_override := NULLIF(current_setting('unusonic.actor_user_id_override', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_user_override := NULL;
  END;
  IF v_user_override IS NOT NULL THEN
    v_actor_user := v_user_override;
  END IF;

  BEGIN
    v_suggestion_id := NULLIF(current_setting('unusonic.aion_suggestion_id', true), '')::uuid;
  EXCEPTION WHEN OTHERS THEN
    v_suggestion_id := NULL;
  END;

  IF TG_OP = 'INSERT' AND NEW.stage_id IS NOT NULL THEN
    SELECT s.triggers INTO v_triggers
      FROM ops.pipeline_stages s
     WHERE s.id = NEW.stage_id;

    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, metadata, triggers_snapshot,
      suggestion_insight_id
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, NULL, NEW.stage_id,
      v_actor_user, v_actor_kind,
      jsonb_build_object('phase', 3), v_triggers,
      v_suggestion_id
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
    SELECT s.triggers INTO v_triggers
      FROM ops.pipeline_stages s
     WHERE s.id = NEW.stage_id;

    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, metadata, triggers_snapshot,
      suggestion_insight_id
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, OLD.stage_id, NEW.stage_id,
      v_actor_user, v_actor_kind,
      jsonb_build_object('phase', 3), v_triggers,
      v_suggestion_id
    )
    RETURNING id INTO v_new_transition_id;

    -- Stamp stale pending follow-ups for this deal as superseded.
    UPDATE ops.follow_up_queue q
       SET superseded_at = now()
     WHERE q.deal_id = NEW.id
       AND q.status = 'pending'
       AND q.superseded_at IS NULL
       AND q.originating_stage_id IS NOT NULL
       AND q.originating_stage_id <> NEW.stage_id;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.record_deal_transition() IS
  'Records each deal stage change into ops.deal_transitions with a snapshot of the target stage triggers. Reads two optional session-local settings: unusonic.actor_kind_override (forces user/aion/system) and unusonic.aion_suggestion_id (stamps suggestion_insight_id). Unset settings = no-op; pre-P0 and Stripe/dispatcher callers are unaffected. Also stamps superseded_at on pending follow-ups from prior stages.';


-- =============================================================================
-- 6. ops.record_deal_transition_with_actor — the explicit-actor wrapper
--
-- Server actions that accept Aion stage-advance suggestions call this instead
-- of raw UPDATE public.deals. It:
--   1. Validates p_actor_kind and enforces NOT NULL p_actor_id when 'user'.
--   2. Short-circuits (returns NULL transition_id) if deal is already at the
--      target stage — UI can treat NULL as "already advanced, no change."
--   3. SET LOCAL the two session GUCs so the trigger stamps the transition.
--   4. UPDATEs public.deals.stage_id, which fires record_deal_transition().
--   5. Returns the newly-inserted transition_id (looked up by the trigger's
--      just-written row — most-recent for this deal).
--
-- SET LOCAL scopes the GUC to this transaction. No cleanup needed.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.record_deal_transition_with_actor(
  p_deal_id                uuid,
  p_to_stage_id            uuid,
  p_actor_kind             text,
  p_actor_id               uuid DEFAULT NULL,
  p_reason                 text DEFAULT NULL,
  p_suggestion_insight_id  uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops, cortex
AS $$
DECLARE
  v_transition_id uuid;
  v_current_stage uuid;
  v_workspace_id  uuid;
BEGIN
  -- Explicit actor validation
  IF p_actor_kind NOT IN ('user', 'aion', 'system') THEN
    RAISE EXCEPTION 'invalid actor_kind %; must be user|aion|system', p_actor_kind;
  END IF;
  IF p_actor_kind = 'user' AND p_actor_id IS NULL THEN
    RAISE EXCEPTION 'actor_kind=user requires p_actor_id';
  END IF;

  -- Read current stage; idempotency short-circuit
  SELECT stage_id, workspace_id
    INTO v_current_stage, v_workspace_id
    FROM public.deals
   WHERE id = p_deal_id
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'deal % not found', p_deal_id;
  END IF;

  IF v_current_stage IS NOT DISTINCT FROM p_to_stage_id THEN
    -- Already at target stage; caller treats NULL as noop
    RETURN NULL;
  END IF;

  -- Session-local provenance for the trigger to read. SET LOCAL (third arg
  -- true) — auto-clears at end of transaction; no caller cleanup required.
  PERFORM set_config('unusonic.actor_kind_override', p_actor_kind, true);
  IF p_actor_id IS NOT NULL THEN
    PERFORM set_config('unusonic.actor_user_id_override', p_actor_id::text, true);
  END IF;
  IF p_suggestion_insight_id IS NOT NULL THEN
    PERFORM set_config('unusonic.aion_suggestion_id', p_suggestion_insight_id::text, true);
  END IF;

  -- This fires record_deal_transition(), which reads the GUCs and inserts
  -- into ops.deal_transitions with suggestion_insight_id and the override.
  UPDATE public.deals
     SET stage_id = p_to_stage_id
   WHERE id = p_deal_id;

  -- Capture the just-inserted transition. Most-recent for this deal targeting
  -- this stage within the last 5 seconds is the winner — matches the
  -- claim_pending_transitions dedup window.
  SELECT id INTO v_transition_id
    FROM ops.deal_transitions
   WHERE deal_id = p_deal_id
     AND to_stage_id = p_to_stage_id
     AND entered_at >= now() - interval '5 seconds'
   ORDER BY entered_at DESC
   LIMIT 1;

  -- Stamp p_reason into metadata if provided (non-destructive merge)
  IF p_reason IS NOT NULL AND v_transition_id IS NOT NULL THEN
    UPDATE ops.deal_transitions
       SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('reason', p_reason)
     WHERE id = v_transition_id;
  END IF;

  RETURN v_transition_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.record_deal_transition_with_actor(uuid, uuid, text, uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION ops.record_deal_transition_with_actor(uuid, uuid, text, uuid, text, uuid)
  TO service_role;

COMMENT ON FUNCTION ops.record_deal_transition_with_actor(uuid, uuid, text, uuid, text, uuid) IS
  'Explicit-actor wrapper for stage advancement. Used by server actions accepting Aion stage-advance suggestions. Validates actor, short-circuits if already at target stage (returns NULL), sets session GUCs (unusonic.actor_kind_override, unusonic.aion_suggestion_id) that the record_deal_transition trigger reads. Service-role only — server action must validate workspace membership and capability before calling. See docs/reference/aion-deal-card-unified-design.md §8.1 and §10.1.';


-- =============================================================================
-- Done. Verification checklist:
--   SELECT linked_insight_id FROM ops.follow_up_queue LIMIT 1;  -- column exists
--   SELECT hide_from_portal FROM cortex.aion_insights LIMIT 1;  -- column exists
--   SELECT * FROM cortex.portal_aion_insights LIMIT 1;          -- view selectable
--   SELECT suggestion_insight_id FROM ops.deal_transitions LIMIT 1; -- column exists
--   SELECT ops.record_deal_transition_with_actor(…) WITH a deal already at
--     target stage → returns NULL without error.
-- =============================================================================
