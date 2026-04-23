-- =============================================================================
-- Aion Phase 3 Sprint 2 §3.5 — Write-path expansion infrastructure.
--
-- Two pieces:
--   1. ops.aion_write_log — audit trail for every Aion write action. One row
--      per (tool invocation, draft) that moves through drafted → confirmed →
--      executed. Used by requireConfirmed() gate in src/app/api/aion/lib/
--      require-confirmed.ts. RLS: SELECT for workspace members; writes only
--      via service_role (SECURITY DEFINER server actions).
--
--   2. public.deal_in_workspace(p_deal_id) RETURNS boolean — SECURITY DEFINER
--      membership check. Every Aion write handler must call this before
--      accepting a deal_id param. Belt + RLS on public.deals — even if a
--      handler had a logic bug, the RPC would block cross-workspace writes.
--      Grants discipline per feedback_postgres_function_grants memory.
-- =============================================================================


-- =============================================================================
-- 1. ops.aion_write_log
-- =============================================================================

CREATE TABLE IF NOT EXISTS ops.aion_write_log (
  id                uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id      uuid        NOT NULL,
  user_id           uuid        NOT NULL,
  session_id        uuid,
  tool_name         text        NOT NULL CHECK (tool_name IN (
    'send_reply', 'schedule_followup', 'update_narrative'
  )),
  deal_id           uuid,
  artifact_ref      jsonb       NOT NULL DEFAULT '{}',
  input_params      jsonb       NOT NULL DEFAULT '{}',
  drafted_at        timestamptz NOT NULL DEFAULT now(),
  confirmed_at      timestamptz,
  executed_at       timestamptz,
  result            jsonb,
  created_at        timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX aion_write_log_workspace_idx
  ON ops.aion_write_log (workspace_id, drafted_at DESC);

CREATE INDEX aion_write_log_user_idx
  ON ops.aion_write_log (user_id, drafted_at DESC);

CREATE INDEX aion_write_log_deal_idx
  ON ops.aion_write_log (deal_id, drafted_at DESC)
  WHERE deal_id IS NOT NULL;

CREATE INDEX aion_write_log_unconfirmed_idx
  ON ops.aion_write_log (workspace_id, drafted_at DESC)
  WHERE confirmed_at IS NULL;

ALTER TABLE ops.aion_write_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY aion_write_log_select ON ops.aion_write_log
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT ON ops.aion_write_log TO authenticated;
GRANT SELECT, INSERT, UPDATE ON ops.aion_write_log TO service_role;


-- =============================================================================
-- 2. public.deal_in_workspace(p_deal_id uuid) RETURNS boolean
-- =============================================================================

CREATE OR REPLACE FUNCTION public.deal_in_workspace(p_deal_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user_id uuid;
  v_workspace_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL OR p_deal_id IS NULL THEN
    RETURN false;
  END IF;

  SELECT workspace_id INTO v_workspace_id
  FROM public.deals
  WHERE id = p_deal_id;

  IF v_workspace_id IS NULL THEN
    RETURN false;
  END IF;

  RETURN EXISTS (
    SELECT 1 FROM public.workspace_members wm
    WHERE wm.workspace_id = v_workspace_id
      AND wm.user_id      = v_user_id
  );
END;
$$;

COMMENT ON FUNCTION public.deal_in_workspace(uuid) IS
  'Aion Phase 3 §3.5: caller-membership check for write tools. Returns FALSE on not-found OR not-a-member (no enumeration oracle). Called from src/app/api/aion/chat/tools/writes.ts.';

REVOKE ALL ON FUNCTION public.deal_in_workspace(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.deal_in_workspace(uuid) TO authenticated;


-- =============================================================================
-- 3. Safety audit
-- =============================================================================

DO $$
DECLARE
  v_leaky_fn text;
BEGIN
  SELECT string_agg(proname, ', ')
  INTO v_leaky_fn
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
    AND prosecdef
    AND proname IN ('deal_in_workspace')
    AND has_function_privilege('anon', oid, 'EXECUTE');

  IF v_leaky_fn IS NOT NULL THEN
    RAISE EXCEPTION
      'Migration audit failed: SECURITY DEFINER function(s) still executable by anon: %. REVOKE required.',
      v_leaky_fn;
  END IF;
END $$;
