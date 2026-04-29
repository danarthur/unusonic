-- Phase 1 RLS hygiene extension — load-time-strategy.md §3.7
--
-- Extends 20260427230125_rls_auth_uid_initplan_hot_tables.sql with the
-- keystone tables Supabase Performance Advisor still flagged after that
-- sweep. Captured 2026-04-28 from `mcp__db14b06c.get_advisors(performance)`:
--   - 61 `auth_rls_initplan` WARN lints remained (hottest 24 fixed here)
--   - 90 `unindexed_foreign_keys` lints (hot-path 5 fixed here)
--
-- Pure perf rewrite, identical access semantics. Targets:
--   * keystone workspace tables (workspace_members, workspaces) joined by
--     EVERY workspace-scoped RLS policy in the platform
--   * proposals + proposal_items + packages + contracts + workspace_tags
--     (CRM Prism deal-open and Proposal Builder hot path)
--   * cortex.ui_notices (Aion-adjacent UX read on every dashboard mount)
--
-- Deferred to a follow-up migration:
--   * ops.events `anon_select_by_client_portal_token` (uses current_setting,
--     not auth.uid — needs the same wrap but different idiom)
--   * ops.handoff_links + public.invitations (compound auth.uid + auth.jwt
--     logic; requires more careful policy review)
--   * 46 multiple_permissive_policies findings (merge or drop redundant
--     client_view_own_* policies — needs design decision on client-portal
--     access path before consolidating)
--   * 83 remaining unindexed FK on lower-priority tables
--
-- Reference:
--   https://supabase.com/docs/guides/database/database-linter?lint=0003_auth_rls_initplan
--   https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys

-- ─────────────────────────────────────────────────────────────────────────
-- 1. auth_rls_initplan — wrap auth.uid() in (SELECT auth.uid())
-- ─────────────────────────────────────────────────────────────────────────

-- public.workspace_members — keystone table joined by every workspace-scoped
-- RLS policy. The `Authenticated users can join workspace` INSERT policy is
-- the one flagged.

DROP POLICY IF EXISTS "Authenticated users can join workspace" ON public.workspace_members;
CREATE POLICY "Authenticated users can join workspace" ON public.workspace_members
  FOR INSERT
  TO authenticated
  WITH CHECK (user_id = (SELECT auth.uid()));

-- public.workspaces — `Users with session can create workspace`

DROP POLICY IF EXISTS "Users with session can create workspace" ON public.workspaces;
CREATE POLICY "Users with session can create workspace" ON public.workspaces
  FOR INSERT
  WITH CHECK ((SELECT auth.uid()) IS NOT NULL);

-- public.proposals — 4 policies (select / insert / update / delete)

DROP POLICY IF EXISTS proposals_select ON public.proposals;
CREATE POLICY proposals_select ON public.proposals
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS proposals_insert ON public.proposals;
CREATE POLICY proposals_insert ON public.proposals
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS proposals_update ON public.proposals;
CREATE POLICY proposals_update ON public.proposals
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS proposals_delete ON public.proposals;
CREATE POLICY proposals_delete ON public.proposals
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

-- public.proposal_items — 4 policies (subqueries via proposals)

DROP POLICY IF EXISTS proposal_items_select ON public.proposal_items;
CREATE POLICY proposal_items_select ON public.proposal_items
  FOR SELECT
  USING (
    proposal_id IN (
      SELECT proposals.id FROM proposals
      WHERE proposals.workspace_id IN (
        SELECT workspace_members.workspace_id
        FROM workspace_members
        WHERE workspace_members.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS proposal_items_insert ON public.proposal_items;
CREATE POLICY proposal_items_insert ON public.proposal_items
  FOR INSERT
  WITH CHECK (
    proposal_id IN (
      SELECT proposals.id FROM proposals
      WHERE proposals.workspace_id IN (
        SELECT workspace_members.workspace_id
        FROM workspace_members
        WHERE workspace_members.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS proposal_items_update ON public.proposal_items;
CREATE POLICY proposal_items_update ON public.proposal_items
  FOR UPDATE
  USING (
    proposal_id IN (
      SELECT proposals.id FROM proposals
      WHERE proposals.workspace_id IN (
        SELECT workspace_members.workspace_id
        FROM workspace_members
        WHERE workspace_members.user_id = (SELECT auth.uid())
      )
    )
  );

DROP POLICY IF EXISTS proposal_items_delete ON public.proposal_items;
CREATE POLICY proposal_items_delete ON public.proposal_items
  FOR DELETE
  USING (
    proposal_id IN (
      SELECT proposals.id FROM proposals
      WHERE proposals.workspace_id IN (
        SELECT workspace_members.workspace_id
        FROM workspace_members
        WHERE workspace_members.user_id = (SELECT auth.uid())
      )
    )
  );

-- public.packages — 4 policies

DROP POLICY IF EXISTS packages_workspace_select ON public.packages;
CREATE POLICY packages_workspace_select ON public.packages
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS packages_workspace_insert ON public.packages;
CREATE POLICY packages_workspace_insert ON public.packages
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS packages_workspace_update ON public.packages;
CREATE POLICY packages_workspace_update ON public.packages
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS packages_workspace_delete ON public.packages;
CREATE POLICY packages_workspace_delete ON public.packages
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

-- public.contracts — 4 policies

DROP POLICY IF EXISTS contracts_select ON public.contracts;
CREATE POLICY contracts_select ON public.contracts
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS contracts_insert ON public.contracts;
CREATE POLICY contracts_insert ON public.contracts
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS contracts_update ON public.contracts;
CREATE POLICY contracts_update ON public.contracts
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS contracts_delete ON public.contracts;
CREATE POLICY contracts_delete ON public.contracts
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

-- public.workspace_tags — 4 policies

DROP POLICY IF EXISTS workspace_tags_workspace_select ON public.workspace_tags;
CREATE POLICY workspace_tags_workspace_select ON public.workspace_tags
  FOR SELECT
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS workspace_tags_workspace_insert ON public.workspace_tags;
CREATE POLICY workspace_tags_workspace_insert ON public.workspace_tags
  FOR INSERT
  WITH CHECK (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS workspace_tags_workspace_update ON public.workspace_tags;
CREATE POLICY workspace_tags_workspace_update ON public.workspace_tags
  FOR UPDATE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS workspace_tags_workspace_delete ON public.workspace_tags;
CREATE POLICY workspace_tags_workspace_delete ON public.workspace_tags
  FOR DELETE
  USING (
    workspace_id IN (
      SELECT workspace_members.workspace_id
      FROM workspace_members
      WHERE workspace_members.user_id = (SELECT auth.uid())
    )
  );

-- cortex.ui_notices — SELECT + UPDATE (mark_seen)

DROP POLICY IF EXISTS ui_notices_select ON cortex.ui_notices;
CREATE POLICY ui_notices_select ON cortex.ui_notices
  FOR SELECT
  USING (
    user_id = (SELECT auth.uid())
    AND workspace_id IN (SELECT get_my_workspace_ids())
  );

DROP POLICY IF EXISTS ui_notices_mark_seen ON cortex.ui_notices;
CREATE POLICY ui_notices_mark_seen ON cortex.ui_notices
  FOR UPDATE
  USING (
    user_id = (SELECT auth.uid())
    AND workspace_id IN (SELECT get_my_workspace_ids())
  )
  WITH CHECK (
    user_id = (SELECT auth.uid())
    AND workspace_id IN (SELECT get_my_workspace_ids())
  );

-- ─────────────────────────────────────────────────────────────────────────
-- 2. unindexed_foreign_keys — keystone hot-path indexes
-- ─────────────────────────────────────────────────────────────────────────
--
-- Five FK indexes selected from advisor lints by surface impact:
--   * directory.entities(owner_workspace_id) — joined by EVERY entity RLS
--     read across CRM, Network, Aion entity tools, Plan tab client lookup
--   * public.workspace_members(user_id) — referenced in EVERY workspace-
--     scoped RLS policy in the platform; bare table scan today
--   * ops.events(venue_entity_id) — Plan tab + Network detail + Day Sheet
--   * public.deals(owner_user_id) — CRM kanban "my deals" filter
--   * ops.assignments(event_id) + ops.assignments(entity_id) — Network
--     detail Schedule tab + Aion get_entity_schedule tool
--
-- CREATE INDEX (not CONCURRENTLY) is fine at our pre-launch scale; tables
-- are small enough that the brief lock during migration is acceptable. If
-- this becomes a problem at later scale, switch to a non-transactional
-- CONCURRENTLY migration.

CREATE INDEX IF NOT EXISTS idx_entities_owner_workspace_id
  ON directory.entities (owner_workspace_id);

CREATE INDEX IF NOT EXISTS idx_workspace_members_user_id
  ON public.workspace_members (user_id);

CREATE INDEX IF NOT EXISTS idx_events_venue_entity_id
  ON ops.events (venue_entity_id)
  WHERE venue_entity_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_deals_owner_user_id
  ON public.deals (owner_user_id)
  WHERE owner_user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_assignments_event_id
  ON ops.assignments (event_id);

CREATE INDEX IF NOT EXISTS idx_assignments_entity_id
  ON ops.assignments (entity_id);
