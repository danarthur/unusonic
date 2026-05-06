-- =============================================================================
-- One-time cleanup script — proposal duplicates per deal.
--
-- Operator-run (NOT a migration). Run AFTER reviewing the dry-run output and
-- BEFORE applying 20260505212544_proposal_supersede.sql. The migration adds a
-- partial UNIQUE index over (deal_id) WHERE status='draft' AND superseded_at
-- IS NULL — if any deal carries two live drafts when the index is built, the
-- migration will fail. This script removes that contention conservatively.
--
-- Background: Round 3 audit (2026-05-06) found `upsertProposal` and
-- `addPackageToProposal` could create duplicate proposal rows per deal. Some
-- workspaces (Invisible Touch Events confirmed) accumulated zero-touch
-- residue rows plus genuine DocuSeal-touched rows representing real sends.
--
-- Strategy (per the user's locked decisions):
--   1. Hard-delete zero-touch residue (sent/viewed status with no client
--      engagement, no external artifact, no invoice link).
--   2. For remaining duplicates per deal, soft-supersede all but the latest
--      one. "Latest" uses an ordered precedence ladder so a signed proposal
--      always wins over a draft, etc.
--   3. Print before/after counts.
--
-- Usage (Supabase SQL Editor):
--   - Dry-run: paste the file contents into a transaction; ROLLBACK to inspect.
--       BEGIN;
--       <paste this file>
--       ROLLBACK;  -- inspect RAISE NOTICE output, no changes committed
--   - Apply: same as above but COMMIT instead of ROLLBACK.
--
-- Usage (psql):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f cleanup_proposal_dupes.sql
--
-- Optional scope:
--   To target a single workspace, set the GUC before running the script:
--     SET LOCAL app.cleanup_workspace_id = '00000000-0000-0000-0000-000000000000';
--   Leave unset to operate cross-workspace.
--
-- Conservative defaults:
--   - When in doubt, soft-supersede rather than delete.
--   - Anything with view_count>0, signed_at, accepted_at, deposit_paid_at,
--     first_viewed_at, docuseal_submission_id, OR a finance.invoices row is
--     KEPT (never deleted) — superseded only if it loses the precedence
--     ladder for its deal.
-- =============================================================================

DO $$
DECLARE
  v_workspace_filter uuid;
  v_total_before     bigint;
  v_total_deleted    bigint;
  v_total_superseded bigint;
  v_total_after      bigint;
  v_dupe_deals       bigint;
BEGIN
  -- Resolve optional workspace scope from GUC. NULL = cross-workspace.
  BEGIN
    v_workspace_filter := current_setting('app.cleanup_workspace_id', true)::uuid;
  EXCEPTION WHEN others THEN
    v_workspace_filter := NULL;
  END;

  RAISE NOTICE '--------------------------------------------------------------------';
  RAISE NOTICE 'Proposal dedup cleanup — workspace filter: %',
    COALESCE(v_workspace_filter::text, 'ALL');
  RAISE NOTICE '--------------------------------------------------------------------';

  -- ── BEFORE counts ────────────────────────────────────────────────────────
  SELECT count(*)
    INTO v_total_before
    FROM public.proposals p
   WHERE (v_workspace_filter IS NULL OR p.workspace_id = v_workspace_filter);

  SELECT count(*)
    INTO v_dupe_deals
    FROM (
      SELECT p.deal_id
        FROM public.proposals p
       WHERE p.superseded_at IS NULL
         AND (v_workspace_filter IS NULL OR p.workspace_id = v_workspace_filter)
       GROUP BY p.deal_id
      HAVING count(*) > 1
    ) d;

  RAISE NOTICE 'Proposals before:        %', v_total_before;
  RAISE NOTICE 'Deals with duplicates:   %', v_dupe_deals;

  -- ── Step 1: Hard-delete zero-touch residue ──────────────────────────────
  -- Predicate is intentionally tight: a row only qualifies if EVERY
  -- engagement / artifact / linkage signal is empty.
  WITH zero_touch AS (
    SELECT p.id
      FROM public.proposals p
      LEFT JOIN finance.invoices fi ON fi.proposal_id = p.id
     WHERE (v_workspace_filter IS NULL OR p.workspace_id = v_workspace_filter)
       AND p.status NOT IN ('draft', 'accepted')
       AND p.view_count = 0
       AND p.signed_at IS NULL
       AND p.accepted_at IS NULL
       AND p.deposit_paid_at IS NULL
       AND p.first_viewed_at IS NULL
       AND p.docuseal_submission_id IS NULL
       AND fi.id IS NULL
  )
  DELETE FROM public.proposals p
   USING zero_touch z
   WHERE p.id = z.id;
  GET DIAGNOSTICS v_total_deleted = ROW_COUNT;

  RAISE NOTICE 'Step 1 — zero-touch deleted:   %', v_total_deleted;

  -- ── Step 2: Soft-supersede remaining duplicates per deal ─────────────────
  -- Precedence ladder per deal:
  --   1. accepted_at IS NOT NULL DESC   (signed/accepted wins)
  --   2. signed_at IS NOT NULL DESC     (countersigned PDF wins)
  --   3. deposit_paid_at IS NOT NULL DESC
  --   4. created_at DESC                (newest wins as tiebreaker)
  -- The first row in this order is the "winner"; everyone else is superseded
  -- and pointed at the winner via superseded_by_proposal_id.
  WITH ranked AS (
    SELECT
      p.id,
      p.deal_id,
      row_number() OVER (
        PARTITION BY p.deal_id
        ORDER BY
          (p.accepted_at IS NOT NULL) DESC,
          (p.signed_at IS NOT NULL) DESC,
          (p.deposit_paid_at IS NOT NULL) DESC,
          p.created_at DESC
      ) AS rn,
      first_value(p.id) OVER (
        PARTITION BY p.deal_id
        ORDER BY
          (p.accepted_at IS NOT NULL) DESC,
          (p.signed_at IS NOT NULL) DESC,
          (p.deposit_paid_at IS NOT NULL) DESC,
          p.created_at DESC
      ) AS winner_id
      FROM public.proposals p
     WHERE p.superseded_at IS NULL
       AND (v_workspace_filter IS NULL OR p.workspace_id = v_workspace_filter)
  ),
  to_supersede AS (
    SELECT id, winner_id
      FROM ranked
     WHERE rn > 1
  )
  UPDATE public.proposals p
     SET superseded_at = now(),
         superseded_by_proposal_id = t.winner_id,
         updated_at = now()
    FROM to_supersede t
   WHERE p.id = t.id;
  GET DIAGNOSTICS v_total_superseded = ROW_COUNT;

  RAISE NOTICE 'Step 2 — soft-superseded:      %', v_total_superseded;

  -- ── AFTER counts ─────────────────────────────────────────────────────────
  SELECT count(*)
    INTO v_total_after
    FROM public.proposals p
   WHERE (v_workspace_filter IS NULL OR p.workspace_id = v_workspace_filter);

  RAISE NOTICE '--------------------------------------------------------------------';
  RAISE NOTICE 'Proposals after:         %', v_total_after;
  RAISE NOTICE 'Net rows removed:        %', (v_total_before - v_total_after);
  RAISE NOTICE 'Total rows touched:      %', (v_total_deleted + v_total_superseded);
  RAISE NOTICE '--------------------------------------------------------------------';
END
$$;

-- ── Reporting query ─────────────────────────────────────────────────────────
-- Per-workspace summary of the current state. Run after the script (with the
-- transaction either committed OR open — works either way because the DO
-- block's CTEs already updated visible rows).
SELECT
  p.workspace_id,
  count(*)                                               AS proposals_total,
  count(*) FILTER (WHERE p.superseded_at IS NULL)        AS proposals_live,
  count(*) FILTER (WHERE p.superseded_at IS NOT NULL)    AS proposals_superseded,
  count(*) FILTER (WHERE p.status = 'draft' AND p.superseded_at IS NULL)
                                                         AS open_drafts,
  count(DISTINCT p.deal_id) FILTER (WHERE p.superseded_at IS NULL)
                                                         AS deals_with_live
  FROM public.proposals p
 GROUP BY p.workspace_id
 ORDER BY proposals_total DESC;
