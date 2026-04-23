-- =============================================================================
-- Custom Pipelines — Phase 1: schema, RLS, seed, backfill
--
-- Full design: docs/reference/custom-pipelines-design.md §12 Phase 1.
--
-- Creates three new ops tables (pipelines, pipeline_stages, deal_transitions),
-- adds pipeline_id + stage_id to public.deals, seeds every existing workspace
-- with a default "Sales" pipeline + 7 stages, backfills each deal's stage_id
-- from its current status, and registers the pipelines:manage capability.
--
-- Non-breaking: no app code reads from these tables yet. Current status column
-- is untouched and the CHECK constraint stays in place. Phase 2 dual-writes
-- and flips reads.
-- =============================================================================


-- =============================================================================
-- 1. ops.pipelines
-- =============================================================================

CREATE TABLE ops.pipelines (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  name         text NOT NULL,
  slug         text NOT NULL,
  description  text,
  is_default   boolean NOT NULL DEFAULT false,
  is_archived  boolean NOT NULL DEFAULT false,
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (workspace_id, slug)
);

COMMENT ON TABLE ops.pipelines IS
  'Workspace-owned pipeline definitions. One is marked is_default per workspace. Part of Custom Pipelines (docs/reference/custom-pipelines-design.md).';

CREATE UNIQUE INDEX pipelines_one_default_per_workspace
  ON ops.pipelines (workspace_id) WHERE is_default = true;

CREATE INDEX pipelines_workspace_id_idx ON ops.pipelines (workspace_id);

ALTER TABLE ops.pipelines ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipelines_select ON ops.pipelines
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY pipelines_insert ON ops.pipelines
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY pipelines_update ON ops.pipelines
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY pipelines_delete ON ops.pipelines
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.pipelines TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.pipelines TO service_role;


-- =============================================================================
-- 2. ops.pipeline_stages
-- =============================================================================

CREATE TABLE ops.pipeline_stages (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  pipeline_id           uuid NOT NULL REFERENCES ops.pipelines(id) ON DELETE CASCADE,
  workspace_id          uuid NOT NULL,
  label                 text NOT NULL,
  slug                  text NOT NULL,
  description           text,
  sort_order            integer NOT NULL,
  kind                  text NOT NULL CHECK (kind IN ('working', 'won', 'lost')),
  color_token           text,
  tags                  text[] NOT NULL DEFAULT ARRAY[]::text[],
  rotting_days          integer,
  requires_confirmation boolean NOT NULL DEFAULT false,
  opens_handoff_wizard  boolean NOT NULL DEFAULT false,
  hide_from_portal      boolean NOT NULL DEFAULT false,
  triggers              jsonb NOT NULL DEFAULT '[]'::jsonb,
  is_archived           boolean NOT NULL DEFAULT false,
  created_at            timestamptz NOT NULL DEFAULT now(),
  updated_at            timestamptz NOT NULL DEFAULT now(),
  UNIQUE (pipeline_id, slug),
  -- Deferrable so drag-reorder can temporarily violate within a transaction
  CONSTRAINT pipeline_stages_sort_order_uniq
    UNIQUE (pipeline_id, sort_order) DEFERRABLE INITIALLY DEFERRED
);

COMMENT ON TABLE ops.pipeline_stages IS
  'Stages within a pipeline. kind anchors behavior (working/won/lost); tags are stable semantic identifiers consumed by Aion, webhooks, and cron.';

CREATE INDEX pipeline_stages_tags_gin ON ops.pipeline_stages USING GIN (tags);
CREATE INDEX pipeline_stages_pipeline_id_idx ON ops.pipeline_stages (pipeline_id);
CREATE INDEX pipeline_stages_workspace_id_idx ON ops.pipeline_stages (workspace_id);

ALTER TABLE ops.pipeline_stages ENABLE ROW LEVEL SECURITY;

CREATE POLICY pipeline_stages_select ON ops.pipeline_stages
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY pipeline_stages_insert ON ops.pipeline_stages
  FOR INSERT WITH CHECK (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY pipeline_stages_update ON ops.pipeline_stages
  FOR UPDATE USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY pipeline_stages_delete ON ops.pipeline_stages
  FOR DELETE USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.pipeline_stages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.pipeline_stages TO service_role;


-- =============================================================================
-- 3. ops.deal_transitions
--    SELECT-via-workspace only; no client writes. Service role writes via RPC
--    (Phase 3). Every deal has at least one row (backfilled in step 8).
-- =============================================================================

CREATE TABLE ops.deal_transitions (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id           uuid NOT NULL,
  deal_id                uuid NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  pipeline_id            uuid NOT NULL REFERENCES ops.pipelines(id),
  from_stage_id          uuid REFERENCES ops.pipeline_stages(id),
  to_stage_id            uuid NOT NULL REFERENCES ops.pipeline_stages(id),
  actor_user_id          uuid,
  actor_kind             text NOT NULL CHECK (actor_kind IN ('user', 'webhook', 'system', 'aion')),
  entered_at             timestamptz NOT NULL DEFAULT now(),
  triggers_dispatched_at timestamptz,
  triggers_failed_at     timestamptz,
  triggers_error         text,
  metadata               jsonb NOT NULL DEFAULT '{}'::jsonb
);

COMMENT ON TABLE ops.deal_transitions IS
  'Append-only audit + trigger-firing signal. Service role writes via RPC. Dispatcher watches triggers_dispatched_at IS NULL rows.';

CREATE INDEX deal_transitions_deal_id_idx
  ON ops.deal_transitions (deal_id, entered_at DESC);

CREATE INDEX deal_transitions_pending_dispatch_idx
  ON ops.deal_transitions (entered_at)
  WHERE triggers_dispatched_at IS NULL;

CREATE INDEX deal_transitions_workspace_id_idx
  ON ops.deal_transitions (workspace_id);

ALTER TABLE ops.deal_transitions ENABLE ROW LEVEL SECURITY;

-- Read-only via workspace; no INSERT/UPDATE/DELETE policies — default deny for
-- authenticated. Service role bypasses RLS for Phase 3 dispatcher writes.
CREATE POLICY deal_transitions_select ON ops.deal_transitions
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT ON ops.deal_transitions TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ops.deal_transitions TO service_role;


-- =============================================================================
-- 4. Add pipeline_id + stage_id to public.deals (nullable during Phase 1)
-- =============================================================================

ALTER TABLE public.deals
  ADD COLUMN pipeline_id uuid REFERENCES ops.pipelines(id),
  ADD COLUMN stage_id    uuid REFERENCES ops.pipeline_stages(id);

CREATE INDEX deals_pipeline_id_idx ON public.deals (pipeline_id);
CREATE INDEX deals_stage_id_idx    ON public.deals (stage_id);


-- =============================================================================
-- 5. Register pipelines:manage capability + grant to system admin role
--    Owner gets it via the workspace:owner wildcard in member_has_capability().
-- =============================================================================

INSERT INTO ops.workspace_permissions (key)
VALUES ('pipelines:manage')
ON CONFLICT (key) DO NOTHING;

INSERT INTO ops.workspace_role_permissions (role_id, permission_id)
SELECT r.id, p.id
FROM ops.workspace_roles r
CROSS JOIN ops.workspace_permissions p
WHERE r.slug = 'admin' AND r.is_system = true AND r.workspace_id IS NULL
  AND p.key = 'pipelines:manage'
ON CONFLICT DO NOTHING;


-- =============================================================================
-- 6. Seed function + apply to every existing workspace (idempotent)
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.seed_default_pipeline(p_workspace_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
DECLARE
  v_pipeline_id uuid;
BEGIN
  -- Skip if a 'sales' pipeline already exists
  SELECT id INTO v_pipeline_id
  FROM ops.pipelines
  WHERE workspace_id = p_workspace_id AND slug = 'sales'
  LIMIT 1;

  IF v_pipeline_id IS NOT NULL THEN
    RETURN v_pipeline_id;
  END IF;

  INSERT INTO ops.pipelines (workspace_id, name, slug, is_default)
  VALUES (p_workspace_id, 'Sales', 'sales', true)
  RETURNING id INTO v_pipeline_id;

  -- Seed the 7 default stages. rotting_days matches today's stall-signal
  -- behavior exactly (inquiry=7, proposal=14, contract_sent=5, rest null).
  -- requires_confirmation matches today's override-gated status list
  -- (contract_signed, deposit_received, won). opens_handoff_wizard replaces
  -- the hardcoded deposit_received → handoff check.
  INSERT INTO ops.pipeline_stages (
    pipeline_id, workspace_id, label, slug, sort_order, kind, tags,
    rotting_days, requires_confirmation, opens_handoff_wizard
  ) VALUES
    (v_pipeline_id, p_workspace_id, 'Inquiry',            'inquiry',          1, 'working', ARRAY['initial_contact'],                             7,    false, false),
    (v_pipeline_id, p_workspace_id, 'Proposal Sent',      'proposal',         2, 'working', ARRAY['proposal_sent'],                               14,   false, false),
    (v_pipeline_id, p_workspace_id, 'Contract Sent',      'contract_sent',    3, 'working', ARRAY['contract_out'],                                5,    false, false),
    (v_pipeline_id, p_workspace_id, 'Contract Signed',    'contract_signed',  4, 'working', ARRAY['contract_signed'],                             NULL, true,  false),
    (v_pipeline_id, p_workspace_id, 'Deposit Received',   'deposit_received', 5, 'working', ARRAY['deposit_received', 'ready_for_handoff'],       NULL, true,  true),
    (v_pipeline_id, p_workspace_id, 'Won',                'won',              6, 'won',     ARRAY['won'],                                         NULL, true,  false),
    (v_pipeline_id, p_workspace_id, 'Lost',               'lost',             7, 'lost',    ARRAY['lost'],                                        NULL, false, false);

  RETURN v_pipeline_id;
END;
$$;

-- Prevent privilege escalation via the SECURITY DEFINER function
REVOKE EXECUTE ON FUNCTION ops.seed_default_pipeline(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.seed_default_pipeline(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION ops.seed_default_pipeline(uuid) TO service_role;

COMMENT ON FUNCTION ops.seed_default_pipeline(uuid) IS
  'Idempotent: creates the default Sales pipeline + 7 stages for a workspace. Invoked by the AFTER INSERT trigger on public.workspaces.';

-- Seed every existing workspace
DO $$
DECLARE
  w record;
BEGIN
  FOR w IN SELECT id FROM public.workspaces LOOP
    PERFORM ops.seed_default_pipeline(w.id);
  END LOOP;
END
$$;


-- =============================================================================
-- 7. AFTER INSERT trigger on public.workspaces — auto-seed new workspaces
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.seed_default_pipeline_on_workspace_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, ops
AS $$
BEGIN
  PERFORM ops.seed_default_pipeline(NEW.id);
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION ops.seed_default_pipeline_on_workspace_insert() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION ops.seed_default_pipeline_on_workspace_insert() FROM anon;

CREATE TRIGGER trg_seed_default_pipeline_on_workspace
  AFTER INSERT ON public.workspaces
  FOR EACH ROW
  EXECUTE FUNCTION ops.seed_default_pipeline_on_workspace_insert();


-- =============================================================================
-- 8. Backfill deals.pipeline_id + deals.stage_id from current status
--    Every deal gets mapped to the default pipeline's stage with matching slug.
--    Current CHECK constraint on public.deals.status guarantees every existing
--    status value matches a seeded stage slug, so this is total.
-- =============================================================================

UPDATE public.deals d
SET pipeline_id = p.id,
    stage_id    = s.id
FROM ops.pipelines p
JOIN ops.pipeline_stages s ON s.pipeline_id = p.id
WHERE p.workspace_id = d.workspace_id
  AND p.slug = 'sales'
  AND s.slug = d.status
  AND d.pipeline_id IS NULL;

-- Post-migration assertion: every deal has pipeline_id + stage_id
DO $$
DECLARE
  v_orphaned_count integer;
BEGIN
  SELECT COUNT(*) INTO v_orphaned_count
  FROM public.deals
  WHERE pipeline_id IS NULL OR stage_id IS NULL;

  IF v_orphaned_count > 0 THEN
    RAISE EXCEPTION 'Phase 1 backfill incomplete: % deals have NULL pipeline_id or stage_id. Investigate before retrying.', v_orphaned_count;
  END IF;
END
$$;


-- =============================================================================
-- 9. Synthetic deal_transitions row per deal — establishes "current state"
--    so age-in-stage queries work from day one. Marked with actor_kind='system'
--    and triggers_dispatched_at=now() so the Phase 3 dispatcher skips these.
-- =============================================================================

INSERT INTO ops.deal_transitions (
  workspace_id, deal_id, pipeline_id, from_stage_id, to_stage_id,
  actor_kind, entered_at, triggers_dispatched_at, metadata
)
SELECT
  d.workspace_id,
  d.id,
  d.pipeline_id,
  NULL,
  d.stage_id,
  'system',
  COALESCE(d.updated_at, d.created_at),
  now(),
  jsonb_build_object('backfill', true)
FROM public.deals d
WHERE d.stage_id IS NOT NULL;


-- =============================================================================
-- 10. updated_at triggers
-- =============================================================================

CREATE OR REPLACE FUNCTION ops.set_pipelines_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_pipelines_updated_at
  BEFORE UPDATE ON ops.pipelines
  FOR EACH ROW EXECUTE FUNCTION ops.set_pipelines_updated_at();

CREATE OR REPLACE FUNCTION ops.set_pipeline_stages_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$;

CREATE TRIGGER trg_pipeline_stages_updated_at
  BEFORE UPDATE ON ops.pipeline_stages
  FOR EACH ROW EXECUTE FUNCTION ops.set_pipeline_stages_updated_at();
