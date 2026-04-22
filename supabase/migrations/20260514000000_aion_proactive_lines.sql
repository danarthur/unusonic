-- =============================================================================
-- cortex.aion_proactive_lines — Phase 2 Sprint 2 / Week 4.
--
-- Proactive deal-card insights that fire when one of three tightly-scoped
-- signals triggers: proposal engagement delta, money event, or dead silence.
-- Single pinned line per deal; click expands the thread.
--
-- Plan: docs/reference/aion-deal-chat-phase2-plan.md §3.2.
--
-- Placement rationale:
--   Plan §3.2.3 speccs `public.aion_proactive_lines`. Moved to cortex to match
--   CLAUDE.md rule 1 (no new tables in public) and to pair with the existing
--   cortex.aion_insights table. Cortex write protection (SELECT-only RLS,
--   writes via SECURITY DEFINER RPCs) is a good fit: the evaluator cron
--   writes via service role, users dismiss via the RPC below. The two tables
--   coexist because they serve different surfaces:
--     cortex.aion_insights         → lobby brief, entity-scoped, unique per
--                                    (trigger_type, entity).
--     cortex.aion_proactive_lines  → deal-card pinned line, deal-scoped,
--                                    unique per deal per workspace-local day.
--
-- Critic fixes applied in this migration:
--   §Risk 3 (soft-expire hides new alerts) — the read index keys on
--     dismissed_at, resolved_at, expires_at so the UI can pick ONLY the
--     single active line and relegate expired/dismissed to a separate list.
--   §Risk 4 (UTC vs workspace-local day bug) — the 1-per-deal-per-24h cap
--     is enforced in workspace-local time via a BEFORE INSERT trigger that
--     sets `created_date_local` from public.workspaces.timezone. Plan's SQL
--     used a non-IMMUTABLE subquery in the index expression, which Postgres
--     rejects; the trigger+column approach gives the same atomic guarantee.
--
-- Grants discipline: see feedback_postgres_function_grants memory. Every new
-- SECURITY DEFINER function REVOKEs from PUBLIC/anon in the same migration.
-- =============================================================================

-- ─── Table ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cortex.aion_proactive_lines (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id       uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  deal_id            uuid NOT NULL REFERENCES public.deals(id)      ON DELETE CASCADE,
  session_id         uuid REFERENCES cortex.aion_sessions(id)       ON DELETE SET NULL,
  signal_type        text NOT NULL CHECK (signal_type IN ('proposal_engagement','money_event','dead_silence')),
  headline           text NOT NULL CHECK (char_length(headline) BETWEEN 1 AND 200),
  -- artifact_ref: { kind: 'proposal'|'payment'|'contact'|'proposal_view'|'deal', id: uuid }
  -- Used by expire-on-resolve hooks in webhook receivers (Week 5).
  artifact_ref       jsonb NOT NULL CHECK (
                       artifact_ref ? 'kind'
                       AND artifact_ref ? 'id'
                       AND jsonb_typeof(artifact_ref->'kind') = 'string'
                       AND jsonb_typeof(artifact_ref->'id')   = 'string'
                     ),
  payload            jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at         timestamptz NOT NULL DEFAULT now(),
  -- Workspace-local day boundary for the 24h cap. Populated by the BEFORE
  -- INSERT trigger. NOT GENERATED because generated columns cannot reference
  -- another table (workspace timezone).
  created_date_local date NOT NULL,
  expires_at         timestamptz NOT NULL DEFAULT (now() + interval '72 hours'),
  dismissed_at       timestamptz,
  dismissed_by       uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at        timestamptz,
  CONSTRAINT aion_proactive_lines_dismiss_pair_check
    CHECK ((dismissed_at IS NULL) = (dismissed_by IS NULL))
);

COMMENT ON TABLE cortex.aion_proactive_lines IS
  'Phase 2 Sprint 2 deal-card pinned lines. One row per (workspace, deal, workspace-local day). See docs/reference/aion-deal-chat-phase2-plan.md §3.2.';

COMMENT ON COLUMN cortex.aion_proactive_lines.created_date_local IS
  'Workspace-local date at insert time. Populated by trigger from public.workspaces.timezone. Drives the 1-per-deal-per-day unique index so the cap is timezone-correct.';

COMMENT ON COLUMN cortex.aion_proactive_lines.artifact_ref IS
  'Reference to the underlying record that triggered the line (a proposal, payment, contact, or the deal itself). Used by webhook receivers to resolve-on-clear.';

-- ─── Trigger: populate created_date_local from workspace timezone ───────────

CREATE OR REPLACE FUNCTION cortex.set_aion_proactive_line_date_local()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public, pg_temp
AS $$
DECLARE
  v_tz text;
BEGIN
  -- Allow explicit override for backfills; otherwise derive from workspace tz.
  IF NEW.created_date_local IS NOT NULL THEN
    RETURN NEW;
  END IF;
  SELECT COALESCE(NULLIF(w.timezone, ''), 'UTC') INTO v_tz
    FROM public.workspaces w WHERE w.id = NEW.workspace_id;
  NEW.created_date_local := (NEW.created_at AT TIME ZONE COALESCE(v_tz, 'UTC'))::date;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION cortex.set_aion_proactive_line_date_local() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS aion_proactive_lines_set_date_local_trg ON cortex.aion_proactive_lines;
CREATE TRIGGER aion_proactive_lines_set_date_local_trg
  BEFORE INSERT ON cortex.aion_proactive_lines
  FOR EACH ROW
  EXECUTE FUNCTION cortex.set_aion_proactive_line_date_local();

-- ─── Indexes ────────────────────────────────────────────────────────────────

-- 24h cap — atomic per workspace-local day. Includes dismissed rows so the
-- cap is absolute (plan §3.2.2: "Cap: 1 new proactive line per deal per 24h").
CREATE UNIQUE INDEX IF NOT EXISTS aion_proactive_lines_daily_cap_idx
  ON cortex.aion_proactive_lines (workspace_id, deal_id, created_date_local);

-- Read path: single active line per deal. The UI picks WHERE dismissed_at IS
-- NULL AND resolved_at IS NULL AND expires_at > now() ORDER BY created_at DESC
-- LIMIT 1 — this composite matches that access pattern tightly.
CREATE INDEX IF NOT EXISTS aion_proactive_lines_active_lookup_idx
  ON cortex.aion_proactive_lines (workspace_id, deal_id, dismissed_at, resolved_at, expires_at, created_at DESC);

-- Throttle query: "2+ dismissals of this signal_type by this user in last 14d".
CREATE INDEX IF NOT EXISTS aion_proactive_lines_throttle_idx
  ON cortex.aion_proactive_lines (workspace_id, deal_id, signal_type, dismissed_at DESC)
  WHERE dismissed_at IS NOT NULL;

-- Artifact resolver: webhook receivers call resolve() with (workspace, kind, id).
CREATE INDEX IF NOT EXISTS aion_proactive_lines_artifact_idx
  ON cortex.aion_proactive_lines
    ((artifact_ref->>'kind'), (artifact_ref->>'id'))
  WHERE resolved_at IS NULL AND dismissed_at IS NULL;

-- ─── RLS ────────────────────────────────────────────────────────────────────

ALTER TABLE cortex.aion_proactive_lines ENABLE ROW LEVEL SECURITY;

-- SELECT only, workspace-scoped. All writes route through RPCs below.
DROP POLICY IF EXISTS aion_proactive_lines_select ON cortex.aion_proactive_lines;
CREATE POLICY aion_proactive_lines_select ON cortex.aion_proactive_lines
  FOR SELECT USING (workspace_id IN (SELECT public.get_my_workspace_ids()));

-- Grants: anon is fully revoked; authenticated gets SELECT only.
REVOKE ALL ON cortex.aion_proactive_lines FROM PUBLIC, anon;
GRANT SELECT ON cortex.aion_proactive_lines TO authenticated;
GRANT ALL    ON cortex.aion_proactive_lines TO service_role;

-- ─── Write RPC: emit a line (service-role-only, idempotent daily) ──────────

CREATE OR REPLACE FUNCTION cortex.emit_aion_proactive_line(
  p_workspace_id uuid,
  p_deal_id      uuid,
  p_signal_type  text,
  p_headline     text,
  p_artifact_ref jsonb,
  p_payload      jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public, pg_temp
AS $$
DECLARE
  v_id       uuid;
  v_enabled  boolean;
BEGIN
  -- Per-deal kill toggle (plan §3.2.2: "funeral scenario"). Honored here so
  -- the cap is evaluated server-side, not just in the evaluator.
  SELECT COALESCE(d.aion_proactive_enabled, true) INTO v_enabled
    FROM public.deals d
   WHERE d.id = p_deal_id AND d.workspace_id = p_workspace_id;
  IF v_enabled IS DISTINCT FROM true THEN
    RETURN NULL;
  END IF;

  -- Atomic daily cap via the unique index. ON CONFLICT preserves the existing
  -- row — the cron's next run picks back up tomorrow.
  INSERT INTO cortex.aion_proactive_lines (
    workspace_id, deal_id, signal_type, headline, artifact_ref, payload
  )
  VALUES (
    p_workspace_id, p_deal_id, p_signal_type, p_headline, p_artifact_ref, COALESCE(p_payload, '{}'::jsonb)
  )
  ON CONFLICT (workspace_id, deal_id, created_date_local) DO NOTHING
  RETURNING id INTO v_id;

  RETURN v_id;  -- NULL when the daily cap blocked the insert
END;
$$;

COMMENT ON FUNCTION cortex.emit_aion_proactive_line(uuid, uuid, text, text, jsonb, jsonb) IS
  'Service-role entry point for the proactive-line evaluator cron. Idempotent per workspace-local day via unique index. Honors public.deals.aion_proactive_enabled.';

-- Service-role only — evaluator runs as service_role.
REVOKE ALL ON FUNCTION cortex.emit_aion_proactive_line(uuid, uuid, text, text, jsonb, jsonb)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cortex.emit_aion_proactive_line(uuid, uuid, text, text, jsonb, jsonb)
  TO service_role;

-- ─── Write RPC: user dismiss ────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION cortex.dismiss_aion_proactive_line(
  p_line_id uuid
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public, pg_temp
AS $$
DECLARE
  v_user_id     uuid;
  v_workspace   uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Resolve the line's workspace and confirm caller is a member. SECURITY
  -- DEFINER bypasses RLS on the table read, so the membership check is the
  -- real boundary here.
  SELECT pl.workspace_id INTO v_workspace
    FROM cortex.aion_proactive_lines pl
   WHERE pl.id = p_line_id
     AND pl.dismissed_at IS NULL;
  IF v_workspace IS NULL THEN
    RETURN false;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = v_workspace
       AND wm.user_id      = v_user_id
  ) THEN
    RAISE EXCEPTION 'Not a member of that workspace' USING ERRCODE = '42501';
  END IF;

  UPDATE cortex.aion_proactive_lines
     SET dismissed_at = now(),
         dismissed_by = v_user_id
   WHERE id = p_line_id
     AND dismissed_at IS NULL;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION cortex.dismiss_aion_proactive_line(uuid) IS
  'User-initiated dismiss for a proactive line. Workspace-member-gated. Writes dismissed_by for throttle tracking (plan §3.2.2: 2 dismisses of same signal_type in 14d → mute 7d).';

REVOKE ALL ON FUNCTION cortex.dismiss_aion_proactive_line(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION cortex.dismiss_aion_proactive_line(uuid)
  TO authenticated, service_role;

-- ─── Write RPC: resolve-on-clear (service-role, called by webhook receivers) ─

CREATE OR REPLACE FUNCTION cortex.resolve_aion_proactive_lines_by_artifact(
  p_workspace_id   uuid,
  p_artifact_kind  text,
  p_artifact_id    uuid
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  UPDATE cortex.aion_proactive_lines
     SET resolved_at = now()
   WHERE workspace_id = p_workspace_id
     AND (artifact_ref->>'kind') = p_artifact_kind
     AND (artifact_ref->>'id')   = p_artifact_id::text
     AND dismissed_at IS NULL
     AND resolved_at IS NULL;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION cortex.resolve_aion_proactive_lines_by_artifact(uuid, text, uuid) IS
  'Service-role expire-on-resolve hook. Called by webhook receivers when the triggering condition clears (deposit paid, proposal reply, etc.). Returns count of rows resolved.';

REVOKE ALL ON FUNCTION cortex.resolve_aion_proactive_lines_by_artifact(uuid, text, uuid)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION cortex.resolve_aion_proactive_lines_by_artifact(uuid, text, uuid)
  TO service_role;

-- ─── Per-deal kill toggle ───────────────────────────────────────────────────
-- Plan §3.2.2: "Per-deal kill toggle. Owner can set 'no proactive lines on
-- this deal' (e.g. funeral scenario). Stored on public.deals.aion_proactive_enabled
-- default true. Tested at evaluator time, not UI time."

ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS aion_proactive_enabled boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.deals.aion_proactive_enabled IS
  'Per-deal kill toggle for proactive-line emission. False = no pinned-line generation. Evaluated inside cortex.emit_aion_proactive_line.';

-- Partial index — most rows are true, the rare false is what we actually
-- care about filtering on in the evaluator.
CREATE INDEX IF NOT EXISTS deals_aion_proactive_disabled_idx
  ON public.deals (workspace_id)
  WHERE aion_proactive_enabled = false;
