-- =============================================================================
-- Proposal Builder rebuild — Phase 2 cleanup.
--
-- Phase 1 (migration 20260501000000) shipped the palette-first studio behind
-- a per-workspace flag `crm.proposal_builder_drag`. After the soak window,
-- Phase 2 deletes the legacy drag studio outright: the flag has no readers
-- anymore, so this migration strips it from every workspace's feature_flags
-- JSONB. The kill-criteria log `ops.proposal_builder_events` and its writer
-- `ops.record_proposal_builder_event(...)` are preserved — they keep
-- producing row_reorder and add_success rows for ongoing observability
-- of the palette studio.
--
-- Idempotent: removing a key that doesn't exist is a no-op.
-- Design doc: docs/reference/proposal-builder-rebuild-design.md §3 Phase 2.
-- =============================================================================

UPDATE public.workspaces
SET    feature_flags = feature_flags - 'crm.proposal_builder_drag'
WHERE  feature_flags ? 'crm.proposal_builder_drag';
