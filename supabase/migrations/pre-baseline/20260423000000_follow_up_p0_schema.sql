-- =============================================================================
-- Follow-Up Engine P0 — schema additions
--
-- Wires the pipeline trigger dispatcher to the follow-up queue so stage
-- transitions can enroll follow-ups declaratively. See `CLAUDE.md` §trigger
-- constraints and the P0 spec (claude-opus-4-7 build chat 2026-04-18).
--
-- This migration is idempotent. Re-running it is a no-op.
--
-- Changes:
--   1. Flip `pipelines.triggers_enabled` feature flag ON by default globally.
--   2. Add follow-up queue columns — `hide_from_portal`, `escalation_count`,
--      `last_escalated_at`, `priority_ceiling`, `dismissal_reason`,
--      `originating_stage_id`, `originating_transition_id`, `primitive_key`,
--      `superseded_at`.
--   3. Drop the `(deal_id) WHERE status IN (pending, snoozed)` unique index —
--      the plan requires multiple concurrent enrollments per deal (e.g.
--      proposal stage has both `on_enter` check-in and `dwell_sla` gone-quiet).
--      Replace with a stricter dedup index keyed on the transition that
--      enrolled the row (see §4.C2 in the critic review).
--   4. Extend the `reason_type` CHECK constraint with the four trigger-driven
--      reason types: `nudge_client`, `check_in`, `gone_quiet`, `thank_you`.
--   5. Add `triggers_snapshot jsonb` to `ops.deal_transitions` — snapshot of
--      the stage's `triggers` array at transition time, so dispatcher runs
--      see the configuration that existed when the stage change happened.
--   6. Create `ops.active_deals` view — working or won-with-future-event.
--      WITH (security_invoker = true, security_barrier = true) so RLS policies
--      on the underlying tables apply to callers.
--   7. Create `ops.portal_follow_up_queue` view — portal-safe subset.
--   8. Index on `ops.events (project_id, starts_at DESC)` — powers the
--      `MAX(starts_at)` aggregate in `ops.active_deals`.
-- =============================================================================


-- =============================================================================
-- 1. Feature flag: triggers_enabled ON by default globally
-- =============================================================================

UPDATE public.workspaces
   SET feature_flags = COALESCE(feature_flags, '{}'::jsonb) || jsonb_build_object('pipelines.triggers_enabled', true)
 WHERE NOT (COALESCE(feature_flags, '{}'::jsonb) ? 'pipelines.triggers_enabled');

ALTER TABLE public.workspaces
  ALTER COLUMN feature_flags SET DEFAULT '{"pipelines.triggers_enabled": true}'::jsonb;


-- =============================================================================
-- 2. Follow-up queue: debounce + portal + dedup columns
-- =============================================================================

ALTER TABLE ops.follow_up_queue
  ADD COLUMN IF NOT EXISTS hide_from_portal         boolean     NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS escalation_count         integer     NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS last_escalated_at        timestamptz,
  ADD COLUMN IF NOT EXISTS priority_ceiling         numeric     NOT NULL DEFAULT 100,
  ADD COLUMN IF NOT EXISTS dismissal_reason         text,
  ADD COLUMN IF NOT EXISTS originating_stage_id     uuid,
  ADD COLUMN IF NOT EXISTS originating_transition_id uuid,
  ADD COLUMN IF NOT EXISTS primitive_key            text,
  ADD COLUMN IF NOT EXISTS superseded_at            timestamptz;

-- dismissal_reason is a text + CHECK rather than a native enum so values can
-- evolve without pg_enum rewrites (memory/feedback_postgres_function_grants.md
-- notes similar ergonomics). Application code validates via a Zod enum but
-- the DB allows any of the five enum values + NULL.
ALTER TABLE ops.follow_up_queue
  DROP CONSTRAINT IF EXISTS follow_up_queue_dismissal_reason_check;

ALTER TABLE ops.follow_up_queue
  ADD CONSTRAINT follow_up_queue_dismissal_reason_check
  CHECK (dismissal_reason IS NULL OR dismissal_reason IN (
    'tire_kicker', 'wrong_timing', 'manual_nudge_sent', 'not_ready', 'other'
  ));


-- =============================================================================
-- 3. Drop old one-per-deal unique index; keep a dedup keyed on transition+
--    primitive so the dispatcher can re-run without double-inserting.
--    See the critic review §C2: dispatcher is at-least-once, so primitives
--    MUST be idempotent. INSERT … ON CONFLICT DO NOTHING on this index gives
--    us that guarantee at the DB level.
-- =============================================================================

DROP INDEX IF EXISTS ops.follow_up_queue_deal_uniq;

-- Two dedup rules:
--   (a) same (transition, primitive) enrolls exactly one row, regardless of
--       status. Status-agnostic on purpose: if the first dispatch wrote a
--       pending row, the user dismissed it, and then the dispatcher
--       re-claims the same transition (mark_transition_dispatched failed
--       between the two runs), a WHERE status='pending' filter would let
--       a duplicate row insert. Unconditional uniqueness covers the hole.
--   (b) same (deal, reason_type) can have only one PENDING row — absorbs
--       the legacy cron regenerator's reason-type-based writes and prevents
--       two independent trigger configurations from stacking the same
--       reason on one deal's Today widget.
CREATE UNIQUE INDEX IF NOT EXISTS follow_up_queue_transition_primitive_uniq
  ON ops.follow_up_queue (originating_transition_id, primitive_key)
  WHERE originating_transition_id IS NOT NULL AND primitive_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS follow_up_queue_deal_reason_pending_uniq
  ON ops.follow_up_queue (deal_id, reason_type)
  WHERE status = 'pending';


-- =============================================================================
-- 4. Extend reason_type CHECK with trigger-driven reasons
-- =============================================================================

ALTER TABLE ops.follow_up_queue
  DROP CONSTRAINT IF EXISTS follow_up_queue_reason_type_check;

ALTER TABLE ops.follow_up_queue
  ADD CONSTRAINT follow_up_queue_reason_type_check
  CHECK (reason_type IN (
    'stall', 'engagement_hot', 'deadline_proximity', 'no_owner', 'no_activity',
    'proposal_unseen', 'proposal_bounced', 'proposal_sent', 'date_hold_pressure',
    'nudge_client', 'check_in', 'gone_quiet', 'thank_you'
  ));


-- =============================================================================
-- 5. deal_transitions: triggers_snapshot
--
-- NB: do NOT add a GIN index on this column (critic §H4). It's read by row
-- id from claim_pending_transitions, never scanned. Letting TOAST absorb the
-- JSONB payload out-of-line is the correct storage path.
-- =============================================================================

ALTER TABLE ops.deal_transitions
  ADD COLUMN IF NOT EXISTS triggers_snapshot jsonb;

COMMENT ON COLUMN ops.deal_transitions.triggers_snapshot IS
  'Snapshot of the target stage''s triggers JSONB at transition time. claim_pending_transitions returns COALESCE(t.triggers_snapshot, s.triggers) so live edits to stage config do not rewrite in-flight transitions. Read-by-row-id only — do NOT add a GIN or btree index here.';


-- =============================================================================
-- 6. ops.active_deals view
--
-- "Active" = status is working OR (status is won AND deal has at least one
-- event starting now or later). Won deals with only past events drop into
-- the Archive surface.
--
-- security_invoker = true makes the view execute under the CALLER's identity
-- so the underlying RLS policies (on public.deals, ops.projects, ops.events)
-- apply normally. Without this, the view would run as its creator (superuser
-- during migration) and leak cross-workspace rows. See critic §C1.
--
-- security_barrier = true prevents query-planner leaks via user-supplied
-- expressions pushed below the view boundary.
-- =============================================================================

DROP VIEW IF EXISTS ops.active_deals;

CREATE VIEW ops.active_deals
  WITH (security_invoker = true, security_barrier = true)
AS
SELECT d.*
  FROM public.deals d
  LEFT JOIN ops.projects p ON p.deal_id = d.id
 WHERE d.archived_at IS NULL
   AND (
         d.status = 'working'
      OR (
           d.status = 'won'
           AND (
             SELECT MAX(e.starts_at)
               FROM ops.events e
              WHERE e.project_id = p.id
           ) >= now()
         )
       );

GRANT SELECT ON ops.active_deals TO authenticated;

COMMENT ON VIEW ops.active_deals IS
  'Working deals OR won deals with at least one future-dated event. security_invoker=true means callers see only their workspace rows via the underlying RLS. Used by CRM pipeline card, Today widget, and any surface that should exclude past-won/archived deals.';


-- =============================================================================
-- 7. ops.portal_follow_up_queue view
--
-- The portal routes should never see follow-ups the owner has marked
-- internal. This view + a capability gate in the portal middleware is the
-- second line of defense behind the app-side `hide_from_portal` filter.
-- =============================================================================

DROP VIEW IF EXISTS ops.portal_follow_up_queue;

CREATE VIEW ops.portal_follow_up_queue
  WITH (security_invoker = true, security_barrier = true)
AS
SELECT q.*
  FROM ops.follow_up_queue q
 WHERE q.hide_from_portal = false
   AND q.superseded_at IS NULL
   AND q.status = 'pending';

GRANT SELECT ON ops.portal_follow_up_queue TO authenticated;

COMMENT ON VIEW ops.portal_follow_up_queue IS
  'Portal-safe subset of ops.follow_up_queue: only rows owners have flagged client-visible, not superseded, still pending. Portal routes should read from this view, not the raw table. security_invoker=true inherits caller RLS.';


-- =============================================================================
-- 8. Index for ops.active_deals MAX(starts_at) aggregate
-- =============================================================================

CREATE INDEX IF NOT EXISTS ops_events_project_starts_at_idx
  ON ops.events (project_id, starts_at DESC);


-- =============================================================================
-- 9. Extra dedup support: non-unique index on originating_transition_id for
--    the escalation cron's superseded_at stamping (Migration 2) to use.
-- =============================================================================

CREATE INDEX IF NOT EXISTS follow_up_queue_deal_pending_idx
  ON ops.follow_up_queue (deal_id)
  WHERE status = 'pending' AND superseded_at IS NULL;
