-- Phase 7a — RLS auth.uid() initplan optimization for hot-path CRM tables.
--
-- Per Supabase advisor lint 0003_auth_rls_initplan: when a row level
-- security policy calls auth.uid() (or current_setting()) directly,
-- Postgres re-evaluates the function for each row scanned. Wrapping in
-- (SELECT auth.uid()) makes the planner treat it as an initplan — evaluated
-- once per query and cached for the row scan.
--
-- See https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
--
-- Pure perf rewrite, identical access semantics. Targets the four most-queried
-- tables on the CRM page (deals, deal_stakeholders, events) where we observed
-- 700-2000ms render times in dev (2026-04-27 audit).
--
-- Other tables flagged by the advisor (cortex.*, ops.* admin tables, etc.)
-- are deferred to a separate sweep — they're either not on the hot path
-- or their access patterns deserve more careful policy review.

-- ─────────────────────────────────────────────────────────────────────────
-- public.deals — 4 policies
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS deals_workspace_select ON public.deals;
CREATE POLICY deals_workspace_select ON public.deals
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS deals_workspace_insert ON public.deals;
CREATE POLICY deals_workspace_insert ON public.deals
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS deals_workspace_update ON public.deals;
CREATE POLICY deals_workspace_update ON public.deals
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS deals_workspace_delete ON public.deals;
CREATE POLICY deals_workspace_delete ON public.deals
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- ops.deal_stakeholders — 1 policy (insert)
-- The select / update / delete policies use get_my_workspace_ids() which
-- already initplans correctly; only the insert had a direct auth.uid().
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS deal_stakeholders_insert ON ops.deal_stakeholders;
CREATE POLICY deal_stakeholders_insert ON ops.deal_stakeholders
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND deal_id IN (
      SELECT deals.id
      FROM deals
      WHERE deals.workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

-- ─────────────────────────────────────────────────────────────────────────
-- ops.events — 1 policy (insert)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY IF EXISTS events_insert ON ops.events;
CREATE POLICY events_insert ON ops.events
  FOR INSERT
  WITH CHECK (
    (SELECT auth.uid()) IS NOT NULL
    AND (
      (workspace_id IS NOT NULL AND workspace_id IN (SELECT get_my_workspace_ids()))
      OR project_id IN (
        SELECT projects.id
        FROM ops.projects
        WHERE projects.workspace_id IN (SELECT get_my_workspace_ids())
      )
    )
  );
