-- =============================================================================
-- Add supersede + revision tracking to public.proposals.
--
-- Bug history (Round 3 audit, 2026-05-06):
--   `upsertProposal` and `addPackageToProposal` (src/features/sales/api/
--   proposal-actions/main.ts) only checked for an existing draft per deal:
--
--     SELECT id FROM proposals WHERE deal_id = $1 AND status = 'draft' …
--
--   When a deal already had a `sent` / `viewed` / `accepted` proposal but no
--   draft row, the action silently inserted a *new* draft alongside the
--   active proposal — producing two (or more) live proposals per deal. Some
--   workspaces (Invisible Touch Events) accumulated zero-touch residue rows
--   plus DocuSeal-touched rows that genuinely represented separate sends.
--
-- Forward-looking solution ("soft-supersede"):
--   - When a PM "sends a revision", the prior proposal is kept as audit but
--     marked superseded (`superseded_at`, `superseded_by_proposal_id`).
--   - DocuSeal-touched / signed / paid rows are NEVER hard-deleted — they
--     remain queryable for compliance.
--   - The schema-level guard below makes the original bug structurally
--     impossible going forward: at most one open draft per deal.
--
-- Columns:
--   - superseded_at              — timestamp the row was retired (NULL = live).
--   - superseded_by_proposal_id  — pointer to the row that replaced it.
--                                  ON DELETE SET NULL so dropping the
--                                  successor row never cascades and breaks
--                                  the audit trail.
--   - revision_note              — operator-supplied note explaining what
--                                  changed (captured by `sendProposalRevision`).
--
-- Index rationale:
--   `proposals_one_open_draft_per_deal` is a partial UNIQUE index over
--   (deal_id) WHERE status='draft' AND superseded_at IS NULL. This permits:
--     - Many drafts in history (once superseded), one current draft.
--     - Any number of sent / viewed / accepted rows alongside the one draft.
--     - The cleanup script (supabase/scripts/cleanup_proposal_dupes.sql) to
--       run before this index becomes effective for live data — the script
--       supersedes pre-existing duplicates so the index won't fail on apply.
--
-- Interaction with existing flags:
--   `archived_at` does not exist on proposals (workspace-level operator hide
--   is not modeled). If added later, treat as orthogonal to `superseded_at`:
--   archived = operator hide; superseded = automatic on revision.
-- =============================================================================

ALTER TABLE public.proposals
  ADD COLUMN superseded_at timestamptz,
  ADD COLUMN superseded_by_proposal_id uuid REFERENCES public.proposals(id) ON DELETE SET NULL,
  ADD COLUMN revision_note text;

COMMENT ON COLUMN public.proposals.superseded_at IS
  'Timestamp the row was retired by a revision. NULL = live. Set by sendProposalRevision and by the one-time cleanup script for historical duplicates.';

COMMENT ON COLUMN public.proposals.superseded_by_proposal_id IS
  'Pointer to the proposal row that replaced this one (set when a PM sent a revision). ON DELETE SET NULL preserves the audit trail if the successor is later removed.';

COMMENT ON COLUMN public.proposals.revision_note IS
  'Operator-supplied note explaining what changed in this revision (captured by sendProposalRevision). NULL on the original send.';

-- Schema-level guard against the duplicate-draft bug. Past drafts that have
-- been superseded (superseded_at IS NOT NULL) are excluded so revision
-- history can carry many old drafts without violating the unique constraint.
CREATE UNIQUE INDEX proposals_one_open_draft_per_deal
  ON public.proposals (deal_id)
  WHERE status = 'draft' AND superseded_at IS NULL;

COMMENT ON INDEX public.proposals_one_open_draft_per_deal IS
  'At most one live draft per deal. Closes the upsertProposal/addPackageToProposal duplicate-insert bug at the schema level. Apply the cleanup_proposal_dupes.sql script BEFORE this migration to ensure no pre-existing deal violates the partial uniqueness.';

-- =============================================================================
-- public.send_proposal_revision(p_prev_proposal_id, p_revision_note)
--
-- Transactional contract-amendment flow: clones a prior proposal's row and
-- line items into a new draft, supersedes the prior row, captures the
-- revision_note. Workspace-scoped via the existing RLS on public.proposals
-- (the function runs SECURITY DEFINER but verifies the caller owns the
-- prior proposal's workspace before writing).
--
-- Behavior:
--   1. Look up the prior proposal; require status='accepted' (per audit
--      decision: editing accepted = contract amendment, not revert).
--   2. Verify the caller is a member of the prior's workspace.
--   3. Refuse if there is already an open draft for the same deal — the
--      partial UNIQUE index would block insert anyway, but failing early
--      gives a precise error message instead of a 23505 to bubble up.
--   4. INSERT a new draft proposal with revision_note, copying payment
--      defaults (deposit_percent / deadline_days / payment_due_days) from
--      the prior so the revision starts from the same terms.
--   5. INSERT copies of the prior's proposal_items pointed at the new id.
--   6. UPDATE the prior to set superseded_at + superseded_by_proposal_id.
--
-- Returns the new proposal id on success. NULL is never returned — errors
-- raise EXCEPTION and roll the whole thing back.
--
-- Called from src/features/sales/api/proposal-actions/revisions.ts
-- via supabase.rpc('send_proposal_revision', ...).
--
-- Function-grant discipline (per CLAUDE.md note on Postgres function grants
-- defaulting to PUBLIC): immediate REVOKE FROM PUBLIC + GRANT only to
-- authenticated. service_role keeps EXECUTE through default privs.
-- =============================================================================

CREATE OR REPLACE FUNCTION public.send_proposal_revision(
  p_prev_proposal_id uuid,
  p_revision_note text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_prev          public.proposals%ROWTYPE;
  v_caller        uuid;
  v_is_member     boolean;
  v_existing_draft uuid;
  v_new_id        uuid;
  v_new_token     uuid;
BEGIN
  v_caller := auth.uid();  -- auth.* functions are always schema-qualified.
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'send_proposal_revision: not authenticated' USING ERRCODE = '42501';
  END IF;

  SELECT * INTO v_prev FROM public.proposals WHERE id = p_prev_proposal_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'send_proposal_revision: proposal % not found', p_prev_proposal_id
      USING ERRCODE = 'P0002';
  END IF;

  -- Workspace membership check — the function is SECURITY DEFINER so we
  -- can't lean on RLS for SELECT here. Match the convention used by other
  -- workspace-scoped RPCs.
  SELECT EXISTS (
    SELECT 1 FROM public.workspace_members wm
     WHERE wm.workspace_id = v_prev.workspace_id
       AND wm.user_id = v_caller
  ) INTO v_is_member;
  IF NOT v_is_member THEN
    RAISE EXCEPTION 'send_proposal_revision: not a member of workspace %', v_prev.workspace_id
      USING ERRCODE = '42501';
  END IF;

  -- Locked decision: revisions only fire on accepted proposals. Pre-accept
  -- edits happen in place via the standard updateProposalItem path.
  IF v_prev.status <> 'accepted' THEN
    RAISE EXCEPTION 'send_proposal_revision: prior proposal must be accepted (got %)', v_prev.status
      USING ERRCODE = '22023';
  END IF;

  IF v_prev.superseded_at IS NOT NULL THEN
    RAISE EXCEPTION 'send_proposal_revision: prior proposal is already superseded'
      USING ERRCODE = '22023';
  END IF;

  SELECT id INTO v_existing_draft
    FROM public.proposals
   WHERE deal_id = v_prev.deal_id
     AND status = 'draft'
     AND superseded_at IS NULL
   LIMIT 1;
  IF v_existing_draft IS NOT NULL THEN
    RAISE EXCEPTION 'send_proposal_revision: deal % already has an open draft (%)', v_prev.deal_id, v_existing_draft
      USING ERRCODE = '23505';
  END IF;

  v_new_token := extensions.gen_random_uuid();

  -- Step 4: insert the new draft, carrying payment defaults.
  INSERT INTO public.proposals (
    workspace_id, deal_id, status, public_token,
    deposit_percent, deposit_deadline_days, payment_due_days,
    revision_note, scope_notes, terms_and_conditions, expires_at
  ) VALUES (
    v_prev.workspace_id, v_prev.deal_id, 'draft', v_new_token,
    v_prev.deposit_percent, v_prev.deposit_deadline_days, v_prev.payment_due_days,
    p_revision_note, v_prev.scope_notes, v_prev.terms_and_conditions, v_prev.expires_at
  )
  RETURNING id INTO v_new_id;

  -- Step 5: clone proposal_items pointing at the new proposal. Skip the
  -- audit/server-stamped columns (id, created_at, updated_at) so the new
  -- rows get fresh defaults.
  INSERT INTO public.proposal_items (
    proposal_id, package_id, origin_package_id, package_instance_id,
    display_group_name, is_client_visible, is_package_header,
    original_base_price, unit_type, unit_multiplier, name, description,
    quantity, unit_price, override_price, actual_cost, internal_notes,
    is_optional, time_start, time_end, show_times_on_proposal,
    definition_snapshot, sort_order
  )
  SELECT
    v_new_id, package_id, origin_package_id, package_instance_id,
    display_group_name, is_client_visible, is_package_header,
    original_base_price, unit_type, unit_multiplier, name, description,
    quantity, unit_price, override_price, actual_cost, internal_notes,
    is_optional, time_start, time_end, show_times_on_proposal,
    definition_snapshot, sort_order
    FROM public.proposal_items
   WHERE proposal_id = p_prev_proposal_id
   ORDER BY sort_order;

  -- Step 6: supersede the prior. Touch updated_at so any reactive listener
  -- picks up the change. now() is in pg_catalog and resolvable even with
  -- empty search_path, but we still qualify pg_catalog explicitly to match
  -- the safety stance of `SET search_path = ''`.
  UPDATE public.proposals
     SET superseded_at = pg_catalog.now(),
         superseded_by_proposal_id = v_new_id,
         updated_at = pg_catalog.now()
   WHERE id = p_prev_proposal_id;

  RETURN v_new_id;
END;
$$;

REVOKE ALL ON FUNCTION public.send_proposal_revision(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.send_proposal_revision(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.send_proposal_revision(uuid, text) TO authenticated;

COMMENT ON FUNCTION public.send_proposal_revision(uuid, text) IS
  'Contract-amendment flow: clones a prior accepted proposal into a new draft, supersedes the prior, captures revision_note. Workspace membership enforced. Called by src/features/sales/api/proposal-actions/revisions.ts.';
