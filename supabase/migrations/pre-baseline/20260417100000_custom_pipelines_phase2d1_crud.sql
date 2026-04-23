-- =============================================================================
-- Custom Pipelines — Phase 2d-1: stage CRUD foundation
--
-- Full design: docs/reference/custom-pipelines-design.md §12 Phase 2.
--
-- 1. Drops the CHECK constraint on public.deals.status so workspaces can
--    rename stages to slugs outside the legacy seven. The Phase 2a sync
--    trigger still keeps status ↔ stage_id consistent; we just stop
--    hard-constraining the allowed values.
-- 2. Adds ops.reorder_pipeline_stages(pipeline_id, ordered_ids) RPC that
--    atomically renumbers sort_order within a single statement, relying on
--    the deferrable unique constraint to allow intermediate violations.
-- =============================================================================


-- 1. Drop deals.status CHECK
ALTER TABLE public.deals
  DROP CONSTRAINT IF EXISTS deals_status_check;


-- 2. Atomic reorder RPC.
--    Takes a pipeline and the full ordered list of its stage ids.
--    Validates: every id belongs to the pipeline, the list matches the
--    pipeline's non-archived stages exactly (prevents partial reorders).
--    Gated on pipelines:manage capability inside the function.
CREATE OR REPLACE FUNCTION ops.reorder_pipeline_stages(
  p_pipeline_id uuid,
  p_stage_ids   uuid[]
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_workspace_id uuid;
  v_existing_count integer;
  v_received_count integer;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM ops.pipelines
  WHERE id = p_pipeline_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Pipeline not found: %', p_pipeline_id;
  END IF;

  IF NOT public.member_has_capability(v_workspace_id, 'pipelines:manage') THEN
    RAISE EXCEPTION 'Missing capability: pipelines:manage';
  END IF;

  -- Every id in the input must be a non-archived stage of this pipeline,
  -- and the input must cover every non-archived stage exactly once.
  SELECT COUNT(*) INTO v_existing_count
  FROM ops.pipeline_stages
  WHERE pipeline_id = p_pipeline_id AND is_archived = false;

  v_received_count := COALESCE(array_length(p_stage_ids, 1), 0);

  IF v_received_count <> v_existing_count THEN
    RAISE EXCEPTION 'Reorder list must cover every non-archived stage: pipeline has %, received %',
      v_existing_count, v_received_count;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM unnest(p_stage_ids) AS input_id
    WHERE NOT EXISTS (
      SELECT 1 FROM ops.pipeline_stages
      WHERE id = input_id AND pipeline_id = p_pipeline_id AND is_archived = false
    )
  ) THEN
    RAISE EXCEPTION 'One or more stage ids do not belong to this pipeline or are archived';
  END IF;

  -- Bulk renumber — deferrable unique constraint allows intermediate duplicates.
  UPDATE ops.pipeline_stages s
  SET sort_order = arr.pos
  FROM unnest(p_stage_ids) WITH ORDINALITY AS arr(id, pos)
  WHERE s.id = arr.id;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.reorder_pipeline_stages(uuid, uuid[]) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.reorder_pipeline_stages(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION ops.reorder_pipeline_stages(uuid, uuid[]) TO authenticated;
GRANT EXECUTE ON FUNCTION ops.reorder_pipeline_stages(uuid, uuid[]) TO service_role;

COMMENT ON FUNCTION ops.reorder_pipeline_stages(uuid, uuid[]) IS
  'Atomic drag-reorder for pipeline stages. Requires pipelines:manage capability. Uses the deferrable unique constraint on (pipeline_id, sort_order).';


-- 3. Atomic create_pipeline_stage — inserts working stage at end-of-working,
--    shifting won/lost sort_order down by 1 inside the same transaction.
CREATE OR REPLACE FUNCTION ops.create_pipeline_stage(
  p_pipeline_id            uuid,
  p_label                  text,
  p_slug                   text,
  p_tags                   text[]    DEFAULT ARRAY[]::text[],
  p_rotting_days           integer   DEFAULT NULL,
  p_color_token            text      DEFAULT NULL,
  p_requires_confirmation  boolean   DEFAULT false,
  p_opens_handoff_wizard   boolean   DEFAULT false,
  p_hide_from_portal       boolean   DEFAULT false
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_workspace_id uuid;
  v_next_sort integer;
  v_new_id uuid;
BEGIN
  SELECT workspace_id INTO v_workspace_id
  FROM ops.pipelines
  WHERE id = p_pipeline_id;

  IF v_workspace_id IS NULL THEN
    RAISE EXCEPTION 'Pipeline not found: %', p_pipeline_id;
  END IF;

  IF NOT public.member_has_capability(v_workspace_id, 'pipelines:manage') THEN
    RAISE EXCEPTION 'Missing capability: pipelines:manage';
  END IF;

  IF COALESCE(trim(p_label), '') = '' THEN
    RAISE EXCEPTION 'Stage label cannot be empty';
  END IF;
  IF COALESCE(trim(p_slug), '') = '' THEN
    RAISE EXCEPTION 'Stage slug cannot be empty';
  END IF;

  SELECT COALESCE(MAX(sort_order), 0) + 1 INTO v_next_sort
  FROM ops.pipeline_stages
  WHERE pipeline_id = p_pipeline_id AND kind = 'working' AND is_archived = false;

  UPDATE ops.pipeline_stages
  SET sort_order = sort_order + 1
  WHERE pipeline_id = p_pipeline_id
    AND kind IN ('won', 'lost');

  INSERT INTO ops.pipeline_stages (
    pipeline_id, workspace_id, label, slug, sort_order, kind, tags,
    rotting_days, requires_confirmation, opens_handoff_wizard,
    hide_from_portal, color_token
  ) VALUES (
    p_pipeline_id, v_workspace_id, p_label, p_slug, v_next_sort, 'working',
    COALESCE(p_tags, ARRAY[]::text[]),
    p_rotting_days, p_requires_confirmation, p_opens_handoff_wizard,
    p_hide_from_portal, p_color_token
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.create_pipeline_stage(uuid, text, text, text[], integer, text, boolean, boolean, boolean) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.create_pipeline_stage(uuid, text, text, text[], integer, text, boolean, boolean, boolean) FROM anon;
GRANT EXECUTE ON FUNCTION ops.create_pipeline_stage(uuid, text, text, text[], integer, text, boolean, boolean, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION ops.create_pipeline_stage(uuid, text, text, text[], integer, text, boolean, boolean, boolean) TO service_role;

COMMENT ON FUNCTION ops.create_pipeline_stage IS
  'Creates a new kind=working stage at end-of-working position, shifting won/lost down. Gated on pipelines:manage.';
