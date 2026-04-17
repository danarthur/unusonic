-- =============================================================================
-- cortex.entity_working_notes — Workspace-scoped working facts per person.
--
-- Holds the three fields the design calls out:
--   • communication_style (free text, ≤ 200 chars — e.g. "prefers text over email")
--   • dnr_flagged + dnr_reason + dnr_note (do-not-rebook with context)
--   • preferred_channel (call / email / sms)
--
-- Critical design choice: keyed on (workspace_id, entity_id), NOT on any
-- relationship edge. This solves the provenance problem — when a person
-- changes companies, the workspace's notes about them stay attached because
-- the edge they live on is workspace↔person directly, not workspace↔company.
--
-- See docs/reference/network-page-ia-redesign.md §4.1, §12.4.
-- =============================================================================

-- ── 1. Table ─────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS cortex.entity_working_notes (
  workspace_id         uuid        NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  entity_id            uuid        NOT NULL REFERENCES directory.entities(id) ON DELETE CASCADE,

  communication_style  text,
  dnr_flagged          boolean     NOT NULL DEFAULT false,
  dnr_reason           text
    CHECK (dnr_reason IS NULL OR dnr_reason IN (
      'paid_late', 'unreliable', 'abuse', 'contractual', 'other'
    )),
  dnr_note             text,
  preferred_channel    text
    CHECK (preferred_channel IS NULL OR preferred_channel IN (
      'call', 'email', 'sms'
    )),

  updated_at           timestamptz NOT NULL DEFAULT now(),
  updated_by           uuid        REFERENCES auth.users(id) ON DELETE SET NULL,

  PRIMARY KEY (workspace_id, entity_id)
);

-- Allow reads by any workspace member.
ALTER TABLE cortex.entity_working_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY entity_working_notes_select ON cortex.entity_working_notes
  FOR SELECT USING (workspace_id IN (SELECT get_my_workspace_ids()));

GRANT SELECT ON cortex.entity_working_notes TO authenticated;
GRANT ALL    ON cortex.entity_working_notes TO service_role;

-- Writes happen via SECURITY DEFINER RPC (below). No INSERT/UPDATE/DELETE
-- policies for authenticated — this prevents privilege escalation per the
-- cortex write-protection rule.

-- ── 2. Upsert RPC ────────────────────────────────────────────────────────────
--
-- Single entry point for all writes. NULL on any field = "leave unchanged."
-- Empty string on text fields = "clear this field." false on dnr_flagged with
-- NULL on reason = "unflag without touching the reason history." Workspace
-- membership is enforced against auth.uid() internally.
-- =============================================================================

CREATE OR REPLACE FUNCTION cortex.upsert_entity_working_notes(
  p_workspace_id         uuid,
  p_entity_id            uuid,
  p_communication_style  text    DEFAULT NULL,
  p_dnr_flagged          boolean DEFAULT NULL,
  p_dnr_reason           text    DEFAULT NULL,
  p_dnr_note             text    DEFAULT NULL,
  p_preferred_channel    text    DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = cortex, public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
BEGIN
  IF v_user_id IS NULL THEN RETURN FALSE; END IF;

  -- Workspace membership guard.
  IF NOT EXISTS (
    SELECT 1 FROM public.workspace_members
    WHERE user_id = v_user_id AND workspace_id = p_workspace_id
  ) THEN RETURN FALSE; END IF;

  -- Entity must be in the same workspace.
  IF NOT EXISTS (
    SELECT 1 FROM directory.entities
    WHERE id = p_entity_id AND owner_workspace_id = p_workspace_id
  ) THEN RETURN FALSE; END IF;

  -- CHECK constraint mirror (fail early with a false return rather than
  -- letting the CHECK raise).
  IF p_dnr_reason IS NOT NULL
     AND p_dnr_reason NOT IN ('paid_late', 'unreliable', 'abuse', 'contractual', 'other', '')
  THEN RETURN FALSE; END IF;
  IF p_preferred_channel IS NOT NULL
     AND p_preferred_channel NOT IN ('call', 'email', 'sms', '')
  THEN RETURN FALSE; END IF;

  INSERT INTO cortex.entity_working_notes (
    workspace_id, entity_id,
    communication_style, dnr_flagged, dnr_reason, dnr_note, preferred_channel,
    updated_at, updated_by
  ) VALUES (
    p_workspace_id, p_entity_id,
    -- On INSERT, NULL means "no value yet," same as default.
    NULLIF(p_communication_style, ''),
    COALESCE(p_dnr_flagged, false),
    NULLIF(p_dnr_reason, ''),
    NULLIF(p_dnr_note, ''),
    NULLIF(p_preferred_channel, ''),
    now(), v_user_id
  )
  ON CONFLICT (workspace_id, entity_id) DO UPDATE SET
    -- Patch semantics: NULL input → leave existing; empty string → clear.
    communication_style = CASE
      WHEN p_communication_style IS NULL THEN cortex.entity_working_notes.communication_style
      WHEN p_communication_style = ''    THEN NULL
      ELSE p_communication_style
    END,
    dnr_flagged = COALESCE(p_dnr_flagged, cortex.entity_working_notes.dnr_flagged),
    dnr_reason = CASE
      WHEN p_dnr_reason IS NULL THEN cortex.entity_working_notes.dnr_reason
      WHEN p_dnr_reason = ''    THEN NULL
      ELSE p_dnr_reason
    END,
    dnr_note = CASE
      WHEN p_dnr_note IS NULL THEN cortex.entity_working_notes.dnr_note
      WHEN p_dnr_note = ''    THEN NULL
      ELSE p_dnr_note
    END,
    preferred_channel = CASE
      WHEN p_preferred_channel IS NULL THEN cortex.entity_working_notes.preferred_channel
      WHEN p_preferred_channel = ''    THEN NULL
      ELSE p_preferred_channel
    END,
    updated_at = now(),
    updated_by = v_user_id;

  RETURN TRUE;
END;
$$;

-- Close default-PUBLIC grant hole.
REVOKE EXECUTE ON FUNCTION cortex.upsert_entity_working_notes(
  uuid, uuid, text, boolean, text, text, text
) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION cortex.upsert_entity_working_notes(
  uuid, uuid, text, boolean, text, text, text
) TO authenticated;

-- Reload PostgREST schema cache so the new RPC + table appear immediately.
NOTIFY pgrst, 'reload schema';
