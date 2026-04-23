-- =============================================================================
-- Extend ops.events to absorb public.events (legacy).
--
-- public.events does not exist in the live DB — these callers are broken.
-- This migration makes ops.events the single events table by:
--   1. Renaming columns to match the app schema (name→title, start_at→starts_at, end_at→ends_at)
--   2. Adding CRM + Event Genome columns
--   3. Backfilling workspace_id from ops.projects
--   4. Replacing RLS to support both workspace_id direct and project join
--
-- After this migration, update all .from('events') callers to:
--   .schema('ops').from('events') with the new column names.
-- =============================================================================

-- =============================================================================
-- 1. Rename canonical columns to match app schema
-- =============================================================================

ALTER TABLE ops.events RENAME COLUMN name TO title;
ALTER TABLE ops.events RENAME COLUMN start_at TO starts_at;
ALTER TABLE ops.events RENAME COLUMN end_at TO ends_at;

-- =============================================================================
-- 2. Add CRM + Event Genome columns
-- =============================================================================

ALTER TABLE ops.events
  ADD COLUMN IF NOT EXISTS workspace_id        uuid REFERENCES public.workspaces(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS lifecycle_status    text,
  ADD COLUMN IF NOT EXISTS status              text NOT NULL DEFAULT 'planned',
  ADD COLUMN IF NOT EXISTS internal_code       text,
  ADD COLUMN IF NOT EXISTS confidentiality_level text,
  ADD COLUMN IF NOT EXISTS slug                text,
  ADD COLUMN IF NOT EXISTS location_name       text,
  ADD COLUMN IF NOT EXISTS location_address    text,
  ADD COLUMN IF NOT EXISTS dates_load_in       timestamptz,
  ADD COLUMN IF NOT EXISTS dates_load_out      timestamptz,
  ADD COLUMN IF NOT EXISTS venue_name          text,
  ADD COLUMN IF NOT EXISTS venue_address       text,
  ADD COLUMN IF NOT EXISTS venue_google_maps_id text,
  ADD COLUMN IF NOT EXISTS logistics_dock_info text,
  ADD COLUMN IF NOT EXISTS logistics_power_info text,
  -- client_id: transitional FK to public.organizations (removed in pass 4 when orgs → directory.entities)
  ADD COLUMN IF NOT EXISTS client_id           uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS producer_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS pm_id               uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS guest_count_expected integer,
  ADD COLUMN IF NOT EXISTS guest_count_actual  integer,
  ADD COLUMN IF NOT EXISTS tech_requirements   jsonb,
  ADD COLUMN IF NOT EXISTS compliance_docs     jsonb,
  ADD COLUMN IF NOT EXISTS crm_probability     numeric,
  ADD COLUMN IF NOT EXISTS crm_estimated_value numeric,
  ADD COLUMN IF NOT EXISTS lead_source         text,
  ADD COLUMN IF NOT EXISTS notes               text,
  ADD COLUMN IF NOT EXISTS actor               text DEFAULT 'user',
  ADD COLUMN IF NOT EXISTS updated_at          timestamptz DEFAULT now();

-- =============================================================================
-- 3. Indexes
-- =============================================================================

CREATE INDEX IF NOT EXISTS ops_events_workspace_id_idx
  ON ops.events (workspace_id)
  WHERE workspace_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS ops_events_lifecycle_status_idx
  ON ops.events (lifecycle_status)
  WHERE lifecycle_status IS NOT NULL;

CREATE INDEX IF NOT EXISTS ops_events_starts_at_idx
  ON ops.events (starts_at);

CREATE INDEX IF NOT EXISTS ops_events_client_id_idx
  ON ops.events (client_id)
  WHERE client_id IS NOT NULL;

-- =============================================================================
-- 4. Backfill workspace_id from ops.projects for crystallized events
-- =============================================================================

UPDATE ops.events e
SET workspace_id = p.workspace_id
FROM ops.projects p
WHERE p.id = e.project_id
  AND e.workspace_id IS NULL;

-- =============================================================================
-- 5. Backfill updated_at for existing rows
-- =============================================================================

UPDATE ops.events
SET updated_at = created_at
WHERE updated_at IS NULL;

-- =============================================================================
-- 6. Replace RLS policies
--    Supports two access patterns:
--      A) workspace_id set directly (gigs created without a project)
--      B) project_id → ops.projects.workspace_id (crystallized events)
-- =============================================================================

ALTER TABLE ops.events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS events_select           ON ops.events;
DROP POLICY IF EXISTS events_insert           ON ops.events;
DROP POLICY IF EXISTS events_update           ON ops.events;
DROP POLICY IF EXISTS events_delete           ON ops.events;
-- Drop any old name variants that may exist
DROP POLICY IF EXISTS ops_events_select       ON ops.events;
DROP POLICY IF EXISTS ops_events_insert       ON ops.events;
DROP POLICY IF EXISTS ops_events_update       ON ops.events;
DROP POLICY IF EXISTS ops_events_delete       ON ops.events;

CREATE POLICY events_select ON ops.events
  FOR SELECT USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    OR project_id IN (
      SELECT id FROM ops.projects
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

CREATE POLICY events_insert ON ops.events
  FOR INSERT WITH CHECK (
    auth.uid() IS NOT NULL AND (
      (workspace_id IS NOT NULL AND workspace_id IN (SELECT get_my_workspace_ids()))
      OR project_id IN (
        SELECT id FROM ops.projects
        WHERE workspace_id IN (SELECT get_my_workspace_ids())
      )
    )
  );

CREATE POLICY events_update ON ops.events
  FOR UPDATE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    OR project_id IN (
      SELECT id FROM ops.projects
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

CREATE POLICY events_delete ON ops.events
  FOR DELETE USING (
    workspace_id IN (SELECT get_my_workspace_ids())
    OR project_id IN (
      SELECT id FROM ops.projects
      WHERE workspace_id IN (SELECT get_my_workspace_ids())
    )
  );

-- =============================================================================
-- 7. Grants (DELETE not granted before)
-- =============================================================================

GRANT DELETE ON ops.events TO authenticated;

-- =============================================================================
-- 8. Comments
-- =============================================================================

COMMENT ON TABLE ops.events IS
  'Single source of truth for all events. Absorbs legacy public.events. '
  'Workspace scoped via workspace_id (direct gigs) or project_id→ops.projects (crystallized deals). '
  'client_id FK to public.organizations is transitional — removed in orgs→directory.entities migration.';

COMMENT ON COLUMN ops.events.workspace_id IS
  'Direct workspace scope. Set for gigs created without a project. NULL for crystallized events (use project_id→projects.workspace_id).';

COMMENT ON COLUMN ops.events.lifecycle_status IS
  'CRM pipeline stage: lead → tentative → confirmed → production → live → post → archived.';

COMMENT ON COLUMN ops.events.client_id IS
  'Transitional FK to public.organizations. Will be replaced by cortex.relationships edge in pass 4.';
