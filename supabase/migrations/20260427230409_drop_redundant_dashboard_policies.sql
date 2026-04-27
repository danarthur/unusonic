-- Phase 7b — drop redundant Dashboard-era PERMISSIVE policies on hot tables.
--
-- Per Supabase advisor lint 0006_multiple_permissive_policies: when multiple
-- PERMISSIVE policies exist for the same {role, action} on a table, Postgres
-- evaluates ALL of them per row. They were originally created via the
-- Supabase Dashboard UI (note the spaces in policy names — "Edit Directory",
-- "View Directory", "Workspace Events") and are now subsumed by named
-- explicit policies that came later via migrations.
--
-- See https://supabase.com/docs/guides/database/database-linter?lint=0006_multiple_permissive_policies
--
-- Verification done before dropping:
--
-- directory.entities:
--   "Edit Directory" (ALL): owner_workspace_id IN get_my_workspace_ids()
--     -> covers SELECT/INSERT/UPDATE/DELETE for workspace members
--     -> SELECT is fully subsumed by "View Directory" (which is broader,
--        also allows NULL workspace_id for global entities)
--     -> INSERT/UPDATE/DELETE are not subsumed — replace with named policies
--        with identical body
--   "View Directory" (SELECT): owner_workspace_id IS NULL OR ... in workspace
--     -> kept; was the broader and correct SELECT path
--
-- ops.events:
--   "Workspace Events" (ALL): project_id IN (workspace's projects)
--     -> covers all 4 cmds via project_id-only check
--     -> events_{select,insert,update,delete} all check workspace_id directly
--        OR project_id (broader, not narrower)
--     -> dropping is purely subsumptive; access semantics unchanged
--
-- Result: each {role, action} now has at most one permissive policy on
-- these tables. Postgres no longer ORs through duplicates per row.

-- ─────────────────────────────────────────────────────────────────────────
-- directory.entities — replace "Edit Directory" with named explicit policies
-- ─────────────────────────────────────────────────────────────────────────

CREATE POLICY directory_entities_insert ON directory.entities
  FOR INSERT
  WITH CHECK (owner_workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY directory_entities_update ON directory.entities
  FOR UPDATE
  USING (owner_workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY directory_entities_delete ON directory.entities
  FOR DELETE
  USING (owner_workspace_id IN (SELECT get_my_workspace_ids()));

DROP POLICY "Edit Directory" ON directory.entities;

-- ─────────────────────────────────────────────────────────────────────────
-- ops.events — drop "Workspace Events" (subsumed by events_*)
-- ─────────────────────────────────────────────────────────────────────────

DROP POLICY "Workspace Events" ON ops.events;
