-- Phase 2.1 Sprint 4 — deal_open_items state table.
--
-- Persists the three-state machine (Open / Acknowledged / Resolved) for
-- conflicts surfaced by ops.feasibility_check_for_deal in the Conflicts panel.
--
-- Key design: items are *derived* per call from feasibility_check_for_deal,
-- but their state lives here keyed by (deal_id, item_key). When the system
-- recomputes conflicts, it LEFT JOINs this table by item_key to attach the
-- current state. Items not in this table default to 'open'.
--
-- Lifecycle:
--   * Open      — newly surfaced gap or system-reset gap
--   * Acknowledged — owner said "I'll handle it" (optional note + audit trail)
--   * Resolved  — gap was closed (e.g., crew assigned, sub-rental confirmed)
--
-- Reopening events (per Phase 2 design doc §3.3 closed set):
--   1. Date change on the deal → DELETE all rows for that deal (the whole
--      feasibility picture has shifted; old acks are stale by definition).
--      Implemented as a BEFORE UPDATE trigger in the next migration.
--   2. Scope change on acked dimension (e.g., archetype changes from "DJ" to
--      "Full band" reopens crew acks) → DELETE all rows for that deal in the
--      simplified Sprint 4 path. Future migration can refine to per-dimension.
--   3. Sub-rental not recorded by T-7d → reopens specific gear acks. Out of
--      scope for Sprint 4 (cron path); Sprint 5 or Phase 2.2.
--
-- Item keys are stable, semantic identifiers like:
--   crew/role/DJ/empty
--   crew/role/Audio A1/exhausted
--   conflict/event/<uuid>
--   conflict/deal/<uuid>
--   conflict/blackout/<entity_id>/<range_start>

CREATE TABLE ops.deal_open_items (
  id            uuid          PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id       uuid          NOT NULL REFERENCES public.deals(id) ON DELETE CASCADE,
  workspace_id  uuid          NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  item_key      text          NOT NULL,
  state         text          NOT NULL CHECK (state IN ('open', 'acknowledged', 'resolved')) DEFAULT 'open',

  -- Audit trail for acknowledge/resolve transitions.
  ack_note      text          NULL,
  acted_by      uuid          NULL REFERENCES auth.users(id) ON DELETE SET NULL,
  acted_at      timestamptz   NULL,

  created_at    timestamptz   NOT NULL DEFAULT now(),
  updated_at    timestamptz   NOT NULL DEFAULT now(),

  -- One state row per (deal, item) — the upsert path.
  CONSTRAINT deal_open_items_unique UNIQUE (deal_id, item_key)
);

COMMENT ON TABLE  ops.deal_open_items IS
  'Phase 2.1 Sprint 4 — state machine (Open/Acknowledged/Resolved) for conflicts derived by ops.feasibility_check_for_deal. Items are derived per call; state persists here keyed by (deal_id, item_key). Date-change on the deal wipes all rows (closed reopening event set per design doc §3.3).';
COMMENT ON COLUMN ops.deal_open_items.item_key IS
  'Stable semantic identifier for the derived conflict, e.g. "crew/role/DJ/empty", "conflict/event/<uuid>", "conflict/blackout/<entity_id>/<range_start>".';
COMMENT ON COLUMN ops.deal_open_items.state IS
  'Open: newly surfaced or system-reset. Acknowledged: owner marked handled. Resolved: gap closed externally (e.g., crew assigned).';

-- Hot path: panel reads by deal_id; mutations by (deal_id, item_key).
CREATE INDEX deal_open_items_deal_idx
  ON ops.deal_open_items (deal_id);

-- Cleanup audit: find rows by workspace.
CREATE INDEX deal_open_items_workspace_idx
  ON ops.deal_open_items (workspace_id);

-- updated_at trigger
CREATE OR REPLACE FUNCTION ops.set_deal_open_items_updated_at()
  RETURNS trigger
  LANGUAGE plpgsql
  SET search_path = 'pg_catalog'
AS $function$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$function$;

CREATE TRIGGER trg_deal_open_items_updated_at
  BEFORE UPDATE ON ops.deal_open_items
  FOR EACH ROW
  EXECUTE FUNCTION ops.set_deal_open_items_updated_at();

-- RLS
ALTER TABLE ops.deal_open_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY deal_open_items_select
  ON ops.deal_open_items
  FOR SELECT
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

-- INSERT/UPDATE/DELETE: any workspace member can change the state of their
-- own deals' conflicts. (Admin gating doesn't fit — non-admins on the deal
-- still need to mark items handled in the course of their work.)
CREATE POLICY deal_open_items_insert
  ON ops.deal_open_items
  FOR INSERT
  WITH CHECK (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY deal_open_items_update
  ON ops.deal_open_items
  FOR UPDATE
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()))
  WITH CHECK (workspace_id IN (SELECT public.get_my_workspace_ids()));

CREATE POLICY deal_open_items_delete
  ON ops.deal_open_items
  FOR DELETE
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

GRANT SELECT, INSERT, UPDATE, DELETE ON ops.deal_open_items TO authenticated;
GRANT ALL ON ops.deal_open_items TO service_role;

-- Audit
DO $$
DECLARE
  v_table_exists boolean;
  v_rls_enabled boolean;
  v_policy_count int;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_schema = 'ops' AND table_name = 'deal_open_items'
  ) INTO v_table_exists;

  SELECT relrowsecurity INTO v_rls_enabled
    FROM pg_class WHERE oid = 'ops.deal_open_items'::regclass;

  SELECT COUNT(*) INTO v_policy_count
    FROM pg_policies WHERE schemaname = 'ops' AND tablename = 'deal_open_items';

  IF NOT v_table_exists THEN
    RAISE EXCEPTION 'Safety audit: ops.deal_open_items not created';
  END IF;
  IF NOT v_rls_enabled THEN
    RAISE EXCEPTION 'Safety audit: RLS not enabled on ops.deal_open_items';
  END IF;
  IF v_policy_count < 4 THEN
    RAISE EXCEPTION 'Safety audit: ops.deal_open_items has % policies, expected 4', v_policy_count;
  END IF;
END $$;
