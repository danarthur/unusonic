-- =============================================================================
-- Custom Pipelines — Phase 2a: automatic stage_id sync + transition recording
--
-- Full design: docs/reference/custom-pipelines-design.md §12 Phase 2.
--
-- Rather than refactor every status writer in the app, a pair of triggers on
-- public.deals keeps stage_id + pipeline_id in sync with status and records
-- each change in ops.deal_transitions. Writers continue to set `status` as
-- today; the database handles the dual-write. Phase 3 inverts this (writers
-- will target stage_id directly and status becomes derived).
--
-- Also adds:
--   • Won / Lost uniqueness partial indexes (one won and one lost per
--     pipeline) — prerequisite for opening stage CRUD in Phase 2d.
--   • ops.resolve_stage_by_tag(pipeline_id, tag) — utility for the Phase 2c
--     webhook rewrites.
-- =============================================================================


-- =============================================================================
-- 1. Won / Lost uniqueness: exactly one per pipeline
--    Guardian flag on Phase 1 — must land before stage CRUD opens.
-- =============================================================================

CREATE UNIQUE INDEX pipeline_stages_one_won_per_pipeline
  ON ops.pipeline_stages (pipeline_id) WHERE kind = 'won';

CREATE UNIQUE INDEX pipeline_stages_one_lost_per_pipeline
  ON ops.pipeline_stages (pipeline_id) WHERE kind = 'lost';


-- =============================================================================
-- 2. ops.resolve_stage_by_tag(pipeline_id, tag)
--    Returns the single stage in the pipeline holding the given tag, or NULL.
--    Used by webhook handlers (Stripe, DocuSeal) to resolve the workspace's
--    "deposit_received" / "contract_signed" stage regardless of label.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.resolve_stage_by_tag(
  p_pipeline_id uuid,
  p_tag         text
)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, ops
AS $$
  SELECT id
  FROM ops.pipeline_stages
  WHERE pipeline_id = p_pipeline_id
    AND p_tag = ANY (tags)
    AND is_archived = false
  LIMIT 1;
$$;

REVOKE EXECUTE ON FUNCTION ops.resolve_stage_by_tag(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.resolve_stage_by_tag(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION ops.resolve_stage_by_tag(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION ops.resolve_stage_by_tag(uuid, text) TO service_role;

COMMENT ON FUNCTION ops.resolve_stage_by_tag(uuid, text) IS
  'Resolves a semantic stage tag (e.g. ''deposit_received'') to the workspace''s pipeline stage id. Used by webhook handlers that must advance a deal regardless of the workspace''s stage labels.';


-- =============================================================================
-- 3. BEFORE INSERT OR UPDATE trigger: sync stage_id/pipeline_id from status
--
--    Writers set status; the trigger looks up the matching stage in the
--    workspace's default pipeline and populates stage_id + pipeline_id.
--    If those columns were explicitly set by the caller (Phase 3 writers),
--    and they match the status slug, the trigger leaves them alone.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_deal_stage_from_status()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_pipeline_id uuid;
  v_stage_id    uuid;
BEGIN
  -- If stage_id is already consistent with the new status, skip the lookup.
  IF NEW.stage_id IS NOT NULL THEN
    PERFORM 1
    FROM ops.pipeline_stages
    WHERE id = NEW.stage_id AND slug = NEW.status;
    IF FOUND THEN
      -- Ensure pipeline_id is also filled in (first-write case)
      IF NEW.pipeline_id IS NULL THEN
        SELECT pipeline_id INTO NEW.pipeline_id
        FROM ops.pipeline_stages WHERE id = NEW.stage_id;
      END IF;
      RETURN NEW;
    END IF;
  END IF;

  -- Look up the stage matching NEW.status in the workspace's default pipeline.
  SELECT p.id, s.id INTO v_pipeline_id, v_stage_id
  FROM ops.pipelines p
  JOIN ops.pipeline_stages s ON s.pipeline_id = p.id
  WHERE p.workspace_id = NEW.workspace_id
    AND p.is_default = true
    AND s.slug = NEW.status
    AND s.is_archived = false;

  IF v_stage_id IS NULL THEN
    -- No matching stage. Shouldn't happen post-Phase-1 backfill, but don't
    -- block the write — log a warning so the drift shows up in Postgres logs.
    RAISE WARNING 'sync_deal_stage_from_status: no stage for workspace=% status=% (deal=%)',
      NEW.workspace_id, NEW.status, NEW.id;
    RETURN NEW;
  END IF;

  NEW.pipeline_id := v_pipeline_id;
  NEW.stage_id    := v_stage_id;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_deal_stage_from_status() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_deal_stage_from_status() FROM anon;

CREATE TRIGGER trg_sync_deal_stage_from_status
  BEFORE INSERT OR UPDATE OF status ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_deal_stage_from_status();

COMMENT ON FUNCTION public.sync_deal_stage_from_status() IS
  'Phase 2a: keeps public.deals.stage_id + pipeline_id synchronized with the legacy status column. Phase 3 inverts this — writers will target stage_id directly and status becomes derived.';


-- =============================================================================
-- 4. AFTER INSERT OR UPDATE trigger: record deal transitions
--
--    Inserts a row into ops.deal_transitions whenever stage_id changes (or on
--    deal INSERT). Marks triggers_dispatched_at = now() so the Phase 3
--    trigger dispatcher skips these historical rows — Phase 3 will remove
--    this auto-stamp to start processing real transitions.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.record_deal_transition()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_actor_user uuid;
  v_actor_kind text;
BEGIN
  -- auth.uid() returns NULL for service-role / webhook / cron writes
  BEGIN
    v_actor_user := auth.uid();
  EXCEPTION WHEN OTHERS THEN
    v_actor_user := NULL;
  END;
  v_actor_kind := CASE WHEN v_actor_user IS NULL THEN 'system' ELSE 'user' END;

  IF TG_OP = 'INSERT' AND NEW.stage_id IS NOT NULL THEN
    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, triggers_dispatched_at, metadata
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, NULL, NEW.stage_id,
      v_actor_user, v_actor_kind, now(),
      jsonb_build_object('phase', 2)
    );
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.stage_id IS DISTINCT FROM OLD.stage_id AND NEW.stage_id IS NOT NULL THEN
    INSERT INTO ops.deal_transitions (
      workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
      actor_user_id, actor_kind, triggers_dispatched_at, metadata
    ) VALUES (
      NEW.workspace_id, NEW.id, NEW.pipeline_id, OLD.stage_id, NEW.stage_id,
      v_actor_user, v_actor_kind, now(),
      jsonb_build_object('phase', 2)
    );
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_deal_transition() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.record_deal_transition() FROM anon;

CREATE TRIGGER trg_record_deal_transition
  AFTER INSERT OR UPDATE OF status, stage_id ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.record_deal_transition();

COMMENT ON FUNCTION public.record_deal_transition() IS
  'Phase 2a: records each deal stage change into ops.deal_transitions for audit and age-in-stage queries. triggers_dispatched_at = now() so the Phase 3 dispatcher will skip these (Phase 3 removes the auto-stamp to activate trigger firing).';
