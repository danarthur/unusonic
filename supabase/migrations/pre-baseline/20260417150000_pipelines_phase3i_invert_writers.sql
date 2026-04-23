-- =============================================================================
-- Custom Pipelines — Phase 3i: invert writer direction
--
-- Full design: docs/reference/custom-pipelines-design.md §4.3
--   "status (text) stays permanently as a denormalized fast path for kind —
--    i.e. status holds the kind of the current stage ('working' | 'won' |
--    'lost')." (Pipedrive pattern.)
--
-- Phase 2a wrote writers → status; the BEFORE trigger derived stage_id by
-- matching the status slug against the workspace's default pipeline stages.
-- Phase 3i inverts this: writers set stage_id; the BEFORE trigger derives
-- status = stage.kind. The column stays for the denormalized fast path.
--
-- Pieces in this migration:
--   1. NEW BEFORE trigger public.sync_deal_status_from_stage() — replaces
--      the old sync_deal_stage_from_status() that went the other way.
--      INSERT path handles the legacy "writer passed slug, no stage_id"
--      case by resolving via the workspace's default pipeline — guarantees
--      backward compatibility for any straggler callers that haven't been
--      flipped yet (and for existing test fixtures that still pass status).
--   2. Drop the old trigger + function.
--   3. Create ops.advance_deal_stage — the canonical user-callable RPC
--      that updates stage_id directly (service_role + authenticated).
--   4. Keep ops.advance_deal_stage_from_webhook's signature intact for
--      call-site compatibility, but let the BEFORE trigger take over
--      status derivation. The p_new_status_slug param is now ignored
--      (documented as deprecated).
--   5. record_deal_transition() is unchanged functionally — included
--      here only as a no-op CREATE OR REPLACE for clarity / file locality.
--      (Already final as of Phase 3d.)
--
-- Phase 3i ships the inversion in isolation. The data migration that
-- collapses legacy slugs to kinds lives in 20260417160000_pipelines_phase3i_collapse_status.sql
-- and only runs once this one is in production.
-- =============================================================================


-- =============================================================================
-- 1. BEFORE trigger: sync_deal_status_from_stage
--
--    Fires BEFORE INSERT OR UPDATE OF stage_id.
--
--    On INSERT:
--      - If stage_id is set: derive NEW.status = stage.kind.
--        (pipeline_id is ALSO populated from the stage row — defensive.)
--      - If stage_id is NULL but status carries a legacy slug: look it up
--        in the workspace's default pipeline, populate stage_id + pipeline_id,
--        then overwrite NEW.status with the stage's kind. This keeps
--        existing legacy callers working during the rolling writer-flip.
--      - If stage_id is NULL and no slug match exists: raise WARNING
--        (the Phase 2a message) and leave NEW.status untouched.
--
--    On UPDATE OF stage_id:
--      - Resolve NEW.stage_id → kind, set NEW.status = kind.
--      - Guard: if the stage row is missing (deleted?), preserve NEW.status
--        rather than overwriting with NULL.
--
--    Writers that still pass a legacy slug in `status` (pre-Phase-3i callers
--    during the feature-flag rollout) will have their slug silently promoted
--    to the corresponding kind. That's the whole point of the rollout:
--    callers can flip one at a time, in any order, without breaking anything.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.sync_deal_status_from_stage()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_kind         text;
  v_pipeline_id  uuid;
  v_stage_id     uuid;
BEGIN
  -- INSERT path
  IF TG_OP = 'INSERT' THEN
    IF NEW.stage_id IS NOT NULL THEN
      -- Writer set stage_id (new direction). Derive kind + pipeline_id.
      SELECT kind, pipeline_id INTO v_kind, v_pipeline_id
      FROM ops.pipeline_stages
      WHERE id = NEW.stage_id;

      IF v_kind IS NOT NULL THEN
        NEW.status := v_kind;
        IF NEW.pipeline_id IS NULL THEN
          NEW.pipeline_id := v_pipeline_id;
        END IF;
      END IF;

      RETURN NEW;
    END IF;

    -- stage_id is NULL — legacy callers that still pass a slug.
    -- Resolve against the workspace's default pipeline.
    IF NEW.status IS NOT NULL THEN
      SELECT p.id, s.id, s.kind
        INTO v_pipeline_id, v_stage_id, v_kind
      FROM ops.pipelines p
      JOIN ops.pipeline_stages s ON s.pipeline_id = p.id
      WHERE p.workspace_id = NEW.workspace_id
        AND p.is_default   = true
        AND s.slug         = NEW.status
        AND s.is_archived  = false;

      IF v_stage_id IS NOT NULL THEN
        NEW.stage_id    := v_stage_id;
        NEW.pipeline_id := v_pipeline_id;
        NEW.status      := v_kind;  -- promote slug → kind
        RETURN NEW;
      END IF;

      RAISE WARNING 'sync_deal_status_from_stage: no stage for workspace=% status=% (deal=%)',
        NEW.workspace_id, NEW.status, NEW.id;
    END IF;

    RETURN NEW;
  END IF;

  -- UPDATE OF stage_id path
  IF TG_OP = 'UPDATE' THEN
    IF NEW.stage_id IS NOT NULL THEN
      SELECT kind INTO v_kind
      FROM ops.pipeline_stages
      WHERE id = NEW.stage_id;

      IF v_kind IS NOT NULL THEN
        NEW.status := v_kind;
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.sync_deal_status_from_stage() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.sync_deal_status_from_stage() FROM anon;

COMMENT ON FUNCTION public.sync_deal_status_from_stage() IS
  'Phase 3i: derives public.deals.status from ops.pipeline_stages.kind whenever stage_id is inserted/updated. Also handles legacy "writer passed slug, no stage_id" callers during the Phase 3i rollout by looking up the matching stage and promoting the slug to its kind. Phase 2a ran the opposite direction (status → stage_id); Phase 3i inverts it and keeps status as a denormalized kind fast-path (design doc §4.3).';


-- =============================================================================
-- 2. Drop the old trigger + function
-- =============================================================================

DROP TRIGGER IF EXISTS trg_sync_deal_stage_from_status ON public.deals;
DROP FUNCTION IF EXISTS public.sync_deal_stage_from_status();

-- Fire the NEW trigger on INSERT OR UPDATE OF stage_id. UPDATE OF stage_id
-- (not status) so that status-only writes from straggler callers still land
-- clean — the old trigger fired on UPDATE OF status, which caused recursive
-- derivations. The INSERT branch above explicitly handles the legacy "set
-- status only" case by resolving stage_id from the slug.
CREATE TRIGGER trg_sync_deal_status_from_stage
  BEFORE INSERT OR UPDATE OF stage_id ON public.deals
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_deal_status_from_stage();


-- =============================================================================
-- 3. ops.advance_deal_stage — canonical user-callable stage-change RPC
--
--    Replaces the direct UPDATE in updateDealStatus. Matches the guard
--    pattern from advance_deal_stage_from_webhook (optional status + tag
--    guards) so the same RPC can power user UI and any future server-side
--    automation that mirrors the webhook semantics.
--
--    Security:
--      - SECURITY DEFINER + search_path locked.
--      - Cross-workspace check: deal's workspace must match the target
--        stage's workspace AND the caller must be a member of it.
--      - Capability check: deals:edit:global (the only deals-edit cap
--        currently registered in ops.workspace_permissions). Mirrors the
--        updateDealStatus action's implicit gate; we harden the RPC so
--        it's safe even when called directly.
--      - REVOKE PUBLIC/anon, GRANT authenticated + service_role.
--
--    Returns true if the update landed (rowcount 1), false if a guard
--    rejected, or raises on cross-workspace / capability failure.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.advance_deal_stage(
  p_deal_id           uuid,
  p_new_stage_id      uuid,
  p_only_if_status_in text[] DEFAULT NULL,
  p_only_if_tags_any  text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_deal_workspace_id  uuid;
  v_deal_status        text;
  v_deal_stage_id      uuid;
  v_current_stage_tags text[];
  v_target_workspace   uuid;
  v_updated            int;
BEGIN
  -- Target stage: resolve workspace_id. Required — we gate on it.
  SELECT workspace_id INTO v_target_workspace
  FROM ops.pipeline_stages
  WHERE id = p_new_stage_id;

  IF v_target_workspace IS NULL THEN
    RAISE EXCEPTION 'advance_deal_stage: target stage not found: %', p_new_stage_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Deal lookup
  SELECT workspace_id, status, stage_id
    INTO v_deal_workspace_id, v_deal_status, v_deal_stage_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_deal_workspace_id IS NULL THEN
    RAISE EXCEPTION 'advance_deal_stage: deal not found: %', p_deal_id
      USING ERRCODE = 'no_data_found';
  END IF;

  -- Cross-workspace protection: the target stage and deal must live in the
  -- same workspace. A mismatch either means a corrupt input or a tenant
  -- escape attempt.
  IF v_deal_workspace_id <> v_target_workspace THEN
    RAISE EXCEPTION 'advance_deal_stage: stage and deal belong to different workspaces'
      USING ERRCODE = 'check_violation';
  END IF;

  -- Caller-membership check: the caller's JWT must include the deal's
  -- workspace. For service_role callers (auth.uid() IS NULL) the SECURITY
  -- DEFINER context skips this — they pass.
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.workspace_members
      WHERE workspace_id = v_deal_workspace_id AND user_id = auth.uid()
    ) THEN
      RAISE EXCEPTION 'advance_deal_stage: not a member of deal workspace'
        USING ERRCODE = 'insufficient_privilege';
    END IF;

    -- Capability check: deals:edit:global is the only registered deals-edit
    -- cap (see migration 20260227230000). Admins and Members both hold it
    -- by default; custom roles opt in explicitly.
    IF NOT public.member_has_capability(v_deal_workspace_id, 'deals:edit:global') THEN
      RAISE EXCEPTION 'advance_deal_stage: missing capability deals:edit:global'
        USING ERRCODE = 'insufficient_privilege';
    END IF;
  END IF;

  -- Guard 1 (legacy / during rollout): status-slug allowlist.
  IF p_only_if_status_in IS NOT NULL
     AND array_length(p_only_if_status_in, 1) IS NOT NULL
     AND v_deal_status IS NOT NULL
     AND NOT (v_deal_status = ANY (p_only_if_status_in)) THEN
    RETURN false;
  END IF;

  -- Guard 2: tag-overlap against the deal's CURRENT stage.
  IF p_only_if_tags_any IS NOT NULL
     AND array_length(p_only_if_tags_any, 1) IS NOT NULL THEN
    IF v_deal_stage_id IS NULL THEN
      RETURN false;
    END IF;
    SELECT tags INTO v_current_stage_tags
    FROM ops.pipeline_stages
    WHERE id = v_deal_stage_id;
    IF v_current_stage_tags IS NULL
       OR NOT (v_current_stage_tags && p_only_if_tags_any) THEN
      RETURN false;
    END IF;
  END IF;

  -- Apply. The BEFORE trigger derives NEW.status = stage.kind.
  UPDATE public.deals
  SET stage_id   = p_new_stage_id,
      updated_at = now()
  WHERE id = p_deal_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage(uuid, uuid, text[], text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage(uuid, uuid, text[], text[]) FROM anon;
GRANT EXECUTE ON FUNCTION ops.advance_deal_stage(uuid, uuid, text[], text[]) TO authenticated;
GRANT EXECUTE ON FUNCTION ops.advance_deal_stage(uuid, uuid, text[], text[]) TO service_role;

COMMENT ON FUNCTION ops.advance_deal_stage(uuid, uuid, text[], text[]) IS
  'Phase 3i: canonical user-callable stage-change RPC. Sets public.deals.stage_id; the BEFORE trigger derives status = stage.kind. Enforces workspace membership + deals:edit capability for authenticated callers. Supports the same two optional guards as advance_deal_stage_from_webhook (status slug allowlist + tag-overlap). Returns true iff the update landed, false when a guard rejected. Raises on cross-workspace or capability violations.';


-- =============================================================================
-- 4. ops.advance_deal_stage_from_webhook — signature preserved, body simplified
--
--    Phase 3h exported a 7-arg signature that takes both the stage_id AND
--    a legacy status slug. After 3i the BEFORE trigger derives status from
--    stage.kind, so the slug arg is redundant. We keep it in the signature
--    (so webhook call sites don't need a migration) but ignore the value
--    in the body. Dropping the slug write also means the trigger alone
--    sees the change and overwrites status with kind — no race.
--
--    Guards 1 + 2 preserved byte-for-byte from 3h.
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.advance_deal_stage_from_webhook(
  p_deal_id             uuid,
  p_new_stage_id        uuid,
  p_new_status_slug     text,
  p_webhook_source      text,
  p_webhook_event_id    text,
  p_only_if_status_in   text[],
  p_only_if_tags_any    text[] DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_workspace_id       uuid;
  v_current_status     text;
  v_current_stage_id   uuid;
  v_current_stage_tags text[];
  v_updated            int;
BEGIN
  -- p_new_status_slug is retained for signature compat but ignored — the
  -- BEFORE trigger derives status from the target stage's kind.
  PERFORM p_new_status_slug;

  SELECT workspace_id, status, stage_id
    INTO v_workspace_id, v_current_status, v_current_stage_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'advance_deal_stage_from_webhook: deal not found: %', p_deal_id;
  END IF;

  -- Guard 1: status-slug allowlist. After 3i the collapse migration reduces
  -- status to {'working','won','lost'}, so any webhook caller still passing
  -- a legacy slug here will reject (correct — legacy slugs no longer exist
  -- in status). Callers SHOULD be passing NULL here and using tag guard only.
  IF p_only_if_status_in IS NOT NULL
     AND array_length(p_only_if_status_in, 1) IS NOT NULL
     AND v_current_status IS NOT NULL
     AND NOT (v_current_status = ANY (p_only_if_status_in)) THEN
    RETURN false;
  END IF;

  -- Guard 2: tag-overlap.
  IF p_only_if_tags_any IS NOT NULL
     AND array_length(p_only_if_tags_any, 1) IS NOT NULL THEN
    IF v_current_stage_id IS NULL THEN
      RETURN false;
    END IF;
    SELECT tags INTO v_current_stage_tags
    FROM ops.pipeline_stages
    WHERE id = v_current_stage_id;
    IF v_current_stage_tags IS NULL
       OR NOT (v_current_stage_tags && p_only_if_tags_any) THEN
      RETURN false;
    END IF;
  END IF;

  -- Stamp webhook session vars so record_deal_transition picks them up.
  PERFORM set_config('custom_pipelines.webhook_source', p_webhook_source, true);
  PERFORM set_config('custom_pipelines.webhook_event_id', p_webhook_event_id, true);

  -- Phase 3i: drop the redundant status write. Trigger derives kind.
  UPDATE public.deals
  SET stage_id   = p_new_stage_id,
      updated_at = now()
  WHERE id = p_deal_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) TO service_role;

COMMENT ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) IS
  'Phase 3i: webhook-initiated stage advance. p_new_status_slug is retained in the signature for call-site compatibility but is IGNORED — the BEFORE trigger derives status from stage.kind. Two optional guards (status-slug allowlist, tag-overlap) preserved from Phase 3h. SET LOCALs custom_pipelines.webhook_source + custom_pipelines.webhook_event_id so record_deal_transition stamps webhook metadata on the inserted deal_transitions row. Service-role only.';


-- =============================================================================
-- 5. record_deal_transition() — unchanged from Phase 3d
--
--    Included here only for file locality — the function is already final
--    (webhook session-var stamping, actor_kind derivation). Phase 3i does
--    NOT touch transition recording.
-- =============================================================================

-- (No change — see 20260417130000_pipelines_phase3d_webhook_metadata.sql.)
