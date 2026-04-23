-- =============================================================================
-- Custom Pipelines — Phase 3h: tag-aware webhook guard
--
-- Extends ops.advance_deal_stage_from_webhook with an optional tag-overlap
-- guard (`p_only_if_tags_any`). Stripe + DocuSeal handlers switch from
-- passing literal status slug lists (e.g. ['inquiry', 'proposal', ...]) to
-- passing semantic tag arrays (e.g. ['initial_contact', 'proposal_sent',
-- ...]). This makes the guards rename-resilient — a workspace that renames
-- "Proposal" to "Pitch" keeps auto-advance working as long as the new stage
-- still carries the `proposal_sent` tag.
--
-- Design decision: extend rather than replace.
--   * Adds `p_only_if_tags_any text[] DEFAULT NULL` at the tail of the arg
--     list so existing callers that don't pass it keep working byte-for-byte.
--   * When the new param is non-null, we look up the current stage's tags
--     and check for any overlap (`&&` operator). NULL = "no tag guard".
--   * Both guards must pass if both are provided. In Phase 3h webhook
--     callers pass ONLY the tag array; the slug array becomes NULL.
--     Legacy/stale callers that still pass the slug array keep working.
--   * Status-slug guard runs first (cheaper — no join); tag guard runs
--     second (requires a lookup into ops.pipeline_stages).
--
-- Full design: docs/reference/custom-pipelines-design.md §9.6 + §9.10.
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
  -- Lookup + guard
  SELECT workspace_id, status, stage_id
    INTO v_workspace_id, v_current_status, v_current_stage_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'advance_deal_stage_from_webhook: deal not found: %', p_deal_id;
  END IF;

  -- Guard 1 (legacy): only advance if deal is still in one of the allowed
  -- pre-state status slugs. NULL / empty array means "no slug guard".
  IF p_only_if_status_in IS NOT NULL
     AND array_length(p_only_if_status_in, 1) IS NOT NULL
     AND v_current_status IS NOT NULL
     AND NOT (v_current_status = ANY (p_only_if_status_in)) THEN
    RETURN false;
  END IF;

  -- Guard 2 (Phase 3h): only advance if the deal's current stage carries
  -- at least one of the required tags. NULL / empty array means "no tag
  -- guard". When current stage has no tags (impossible under the Phase 1
  -- DEFAULT but defensive), `tags && p_only_if_tags_any` returns false,
  -- matching "no overlap → reject".
  IF p_only_if_tags_any IS NOT NULL
     AND array_length(p_only_if_tags_any, 1) IS NOT NULL THEN
    IF v_current_stage_id IS NULL THEN
      -- Deal missing stage_id — Phase 1 backfill should have prevented
      -- this. Rather than silently passing, reject so the caller logs
      -- and operators can investigate. This is strictly more conservative
      -- than the old behavior (old code had no tag guard at all).
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

  -- Stamp session vars so record_deal_transition() picks them up.
  -- SET LOCAL scopes to the current transaction — every RPC call from the
  -- Supabase JS client runs in its own transaction, so this is safe.
  PERFORM set_config('custom_pipelines.webhook_source', p_webhook_source, true);
  PERFORM set_config('custom_pipelines.webhook_event_id', p_webhook_event_id, true);

  UPDATE public.deals
  SET stage_id   = p_new_stage_id,
      status     = p_new_status_slug,
      updated_at = now()
  WHERE id = p_deal_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated > 0;
END;
$$;

-- New 7-arg signature — grant service_role only, revoke from public/anon.
-- Note: this is a NEW function signature (arg list changed) — the 6-arg
-- signature still exists as a separate overload. We must grant on the new
-- sig explicitly; Postgres treats overloads independently for grants.
REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) FROM anon;
REVOKE EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) FROM authenticated;
GRANT EXECUTE ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) TO service_role;

-- Drop the 6-arg overload so there's exactly one function (ambiguity risk
-- from PostgREST and Supabase JS client: the DEFAULT NULL on p_only_if_tags_any
-- means the 7-arg sig is ALSO callable with 6 args, same as the old sig).
-- The old sig is guarded with the same REVOKE/GRANT so security-wise this
-- is a clean swap.
DROP FUNCTION IF EXISTS ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[]);

COMMENT ON FUNCTION ops.advance_deal_stage_from_webhook(uuid, uuid, text, text, text, text[], text[]) IS
  'Phase 3h: webhook-initiated stage advance with tag-aware guard. SET LOCALs the custom_pipelines.webhook_* session vars then UPDATEs public.deals.stage_id + status. The record_deal_transition trigger picks up the session vars and stamps the inserted deal_transitions row with metadata.source=''webhook'', metadata.webhook_origin=<stripe|docuseal>, metadata.webhook_event_id, and actor_kind=''webhook''. Two optional guards: p_only_if_status_in (legacy slug list) and p_only_if_tags_any (tag overlap against current stage). Both must pass if both are non-null. Returns false when any guard rejects. Service-role only.';
