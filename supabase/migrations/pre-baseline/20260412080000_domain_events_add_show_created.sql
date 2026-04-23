-- Extend ops.domain_events to include 'show.created' so deal → event handover
-- is captured as a first-class lifecycle event alongside show.started /
-- show.ended / show.wrapped.
--
-- Context: approved 2026-04-12 as the first step ahead of the Follow-Up Engine
-- queue tables. Until the queue tables land, ops.domain_events itself is the
-- consumer — it's queryable for show-lifecycle history ("when was this show
-- handed off?") and will backfill automation triggers with real history on the
-- day they go live.
--
-- Publisher: src/app/(dashboard)/(features)/crm/actions/handover-deal.ts
--   fires 'show.created' via publishDomainEvent() immediately after the
--   ops.events row is inserted. Fire-and-forget (publishDomainEvent swallows
--   errors to Sentry; failed publish does not roll back the handoff).
--
-- RLS: unchanged. SELECT-only policy on ops.domain_events already scoped by
-- workspace via get_my_workspace_ids(). Writes remain service-role only.

BEGIN;

ALTER TABLE ops.domain_events DROP CONSTRAINT IF EXISTS domain_events_type_check;

ALTER TABLE ops.domain_events ADD CONSTRAINT domain_events_type_check
  CHECK (type IN ('show.created', 'show.started', 'show.ended', 'show.wrapped'));

COMMENT ON TABLE ops.domain_events IS
  'Append-only log of show lifecycle events. Four types: show.created (handover), show.started, show.ended, show.wrapped. Adding a fifth requires a design-doc update and explicit approval per Pass 3 Visionary risk #4.';

COMMIT;
