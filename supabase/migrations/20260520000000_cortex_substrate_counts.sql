-- =============================================================================
-- cortex.substrate_counts — per-workspace inventory totals for Aion retrieval
-- envelopes (Phase 3, Sprint 2, §3.13(a) "name the substrate, every time").
--
-- Returns six flat integer counts scoped to one workspace. Consumed by every
-- retrieval tool handler so Aion always has the substrate universe in context
-- when rendering answers (empty or filled).
--
-- Shape contract: docs/reference/aion-deal-chat-phase3-plan.md §3.13(a).
-- Paired helper: src/app/api/aion/lib/substrate-counts.ts (per-request memo).
--
-- Grants discipline — feedback_postgres_function_grants memory (SEV-0 2026-04-10).
-- Every new SECURITY DEFINER function REVOKEs from PUBLIC/anon in the same
-- migration. Membership check mirrors public.aion_lookup_catalog — same
-- enumeration-oracle discipline (do not differentiate "no workspace" from
-- "not a member").
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.substrate_counts(
  p_workspace_id uuid,
  p_window_days  int DEFAULT 90
)
RETURNS TABLE (
  deals              int,
  entities           int,
  messages_in_window int,
  notes              int,
  catalog_items      int,
  memory_chunks      int
)
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public, directory, ops, cortex
AS $$
DECLARE
  v_user_id uuid;
  v_window  int;
  v_cutoff  timestamptz;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_workspace_id IS NULL THEN
    RAISE EXCEPTION 'workspace_id required' USING ERRCODE = '22004';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = p_workspace_id
       AND wm.user_id      = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of that workspace' USING ERRCODE = '42501';
  END IF;

  v_window := GREATEST(1, LEAST(COALESCE(p_window_days, 90), 3650));
  v_cutoff := now() - (v_window || ' days')::interval;

  RETURN QUERY
    SELECT
      (SELECT count(*)::int FROM public.deals d
         WHERE d.workspace_id = p_workspace_id),
      (SELECT count(*)::int FROM directory.entities e
         WHERE e.owner_workspace_id = p_workspace_id),
      (SELECT count(*)::int FROM ops.messages m
         WHERE m.workspace_id = p_workspace_id
           AND m.created_at >= v_cutoff),
      (SELECT count(*)::int FROM ops.deal_notes n
         WHERE n.workspace_id = p_workspace_id),
      (SELECT count(*)::int FROM public.packages p
         WHERE p.workspace_id = p_workspace_id
           AND p.is_active    = true),
      (SELECT count(*)::int FROM cortex.memory cm
         WHERE cm.workspace_id = p_workspace_id);
END;
$$;

COMMENT ON FUNCTION cortex.substrate_counts(uuid, int) IS
  'Aion Phase 3 §3.13: per-workspace substrate inventory (deals, entities, messages_in_window, notes, catalog_items, memory_chunks). Consumed by every retrieval tool envelope so empty-state answers can name what was searched.';

REVOKE ALL ON FUNCTION cortex.substrate_counts(uuid, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.substrate_counts(uuid, int) TO authenticated;
