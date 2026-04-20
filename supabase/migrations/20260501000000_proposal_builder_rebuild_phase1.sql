-- =============================================================================
-- Proposal Builder rebuild — Phase 1 infrastructure.
--
-- The cross-pane drag-and-drop proposal builder is being replaced with a
-- palette-first, click-to-add interaction. A three-agent research pass on
-- 2026-04-20 (Field Expert + User Advocate + Critic) unanimously recommended
-- abandoning cross-pane drag. Design doc:
--   docs/reference/proposal-builder-rebuild-design.md
--
-- Phase 1 ships the new studio behind a per-workspace feature flag so we can
-- A/B against the drag studio and verify kill criteria before committing to
-- Phase 2 (ripping out @hello-pangea/dnd). This migration:
--
--   1. Backfills `crm.proposal_builder_drag = true` on every existing
--      workspace (rows where `workspaces.created_at <= now()` at migration
--      time — i.e. every row that exists right now). Soft landing: users
--      who have the drag muscle-memory keep the drag studio until we
--      explicitly flip them.
--      Workspaces created AFTER this migration leave the flag unset, which
--      the reader (`isFeatureEnabled`) treats as false → new studio.
--
--   2. Creates `ops.proposal_builder_events` — narrow, append-only log
--      scoped to the 5 kill-criteria metrics in the design doc §4.4.
--      Pattern mirrors `ops.domain_events` (2026-04-11): enumerated event
--      types capped at what Phase 1 actually measures, so the table does
--      not become a general UX dumping ground.
--
--   3. Creates `ops.record_proposal_builder_event(...)` SECURITY DEFINER
--      RPC for the authenticated writer path. Explicit REVOKE FROM PUBLIC
--      / anon per the Postgres function grants rule (feedback memory
--      "Postgres function grants default to PUBLIC").
-- =============================================================================

-- ── 1. Flag backfill on existing workspaces ─────────────────────────────────

UPDATE public.workspaces
SET    feature_flags = coalesce(feature_flags, '{}'::jsonb)
                    || jsonb_build_object('crm.proposal_builder_drag', true)
WHERE  coalesce(feature_flags, '{}'::jsonb) -> 'crm.proposal_builder_drag' IS NULL;

COMMENT ON COLUMN public.workspaces.feature_flags IS
  'Per-workspace feature flag overrides. Namespaced keys (e.g. reports.modular_lobby, crm.proposal_builder_drag) → boolean. Read via shared/lib/feature-flags.ts. Does not bypass tier or billing gates.';

-- ── 2. ops.proposal_builder_events — kill-criteria telemetry ────────────────

CREATE TABLE IF NOT EXISTS ops.proposal_builder_events (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  deal_id       uuid        NOT NULL,
  user_id       uuid        REFERENCES auth.users(id) ON DELETE SET NULL,
  session_id    uuid        NOT NULL,
  variant       text        NOT NULL CHECK (variant IN ('drag', 'palette')),
  type          text        NOT NULL CHECK (type IN (
                  'session_start',
                  'palette_open',
                  'first_add',
                  'add_success',
                  'catalog_scroll',
                  'row_reorder'
                )),
  payload       jsonb       NOT NULL DEFAULT '{}'::jsonb,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS proposal_builder_events_ws_variant_type_created_idx
  ON ops.proposal_builder_events (workspace_id, variant, type, created_at DESC);

CREATE INDEX IF NOT EXISTS proposal_builder_events_session_idx
  ON ops.proposal_builder_events (session_id, created_at);

ALTER TABLE ops.proposal_builder_events ENABLE ROW LEVEL SECURITY;

-- SELECT is allowed to authenticated users scoped to their workspace, so that
-- analytics tooling can read via the standard server client later. Writes are
-- funneled through the SECURITY DEFINER RPC below — no INSERT policy.
DROP POLICY IF EXISTS proposal_builder_events_select ON ops.proposal_builder_events;
CREATE POLICY proposal_builder_events_select ON ops.proposal_builder_events
  FOR SELECT
  USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

REVOKE INSERT, UPDATE, DELETE ON ops.proposal_builder_events FROM public, anon, authenticated;
GRANT  SELECT                  ON ops.proposal_builder_events TO authenticated;
GRANT  ALL                     ON ops.proposal_builder_events TO service_role;

COMMENT ON TABLE ops.proposal_builder_events IS
  'Phase 1 telemetry for the proposal-builder rebuild. Append-only. Capped at six event types — extensions require a design-doc update. Written via ops.record_proposal_builder_event().';

-- ── 3. RPC: ops.record_proposal_builder_event ───────────────────────────────

CREATE OR REPLACE FUNCTION ops.record_proposal_builder_event(
  p_workspace_id uuid,
  p_deal_id      uuid,
  p_session_id   uuid,
  p_variant      text,
  p_type         text,
  p_payload      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_event_id uuid;
BEGIN
  -- Enforce workspace membership. The RPC runs as SECURITY DEFINER, so RLS
  -- on workspace_members still applies via get_my_workspace_ids() because the
  -- function reads auth.uid().
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'not_authenticated';
  END IF;

  -- Use the same helper as the SELECT policy on ops.proposal_builder_events
  -- (get_my_workspace_ids), which explicitly excludes role='client'. This
  -- keeps the write-gate aligned with the read-gate; a client-role member
  -- who somehow lands on /crm/deal/:id/proposal-builder cannot write rows
  -- they could not read back.
  IF NOT (p_workspace_id IN (SELECT public.get_my_workspace_ids())) THEN
    RAISE EXCEPTION 'forbidden: not a workspace member';
  END IF;

  INSERT INTO ops.proposal_builder_events (
    workspace_id, deal_id, user_id, session_id, variant, type, payload
  ) VALUES (
    p_workspace_id, p_deal_id, v_user_id, p_session_id, p_variant, p_type,
    coalesce(p_payload, '{}'::jsonb)
  )
  RETURNING id INTO v_event_id;

  RETURN v_event_id;
END;
$$;

-- Postgres function grants default to PUBLIC — revoke immediately, then grant
-- only to authenticated. Required per the "Postgres function grants default to
-- PUBLIC" feedback memory.
REVOKE ALL ON FUNCTION ops.record_proposal_builder_event(uuid, uuid, uuid, text, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION ops.record_proposal_builder_event(uuid, uuid, uuid, text, text, jsonb) FROM anon;
GRANT  EXECUTE ON FUNCTION ops.record_proposal_builder_event(uuid, uuid, uuid, text, text, jsonb) TO authenticated;
GRANT  EXECUTE ON FUNCTION ops.record_proposal_builder_event(uuid, uuid, uuid, text, text, jsonb) TO service_role;

COMMENT ON FUNCTION ops.record_proposal_builder_event(uuid, uuid, uuid, text, text, jsonb) IS
  'Phase 1 writer for ops.proposal_builder_events. Enforces auth.uid() workspace membership. Called from the /crm proposal-builder route; see src/features/sales/api/proposal-builder-events.ts.';
