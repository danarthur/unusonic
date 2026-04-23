-- =============================================================================
-- Phase 0.5 — Client Portal Proposal Entity Resolver
-- =============================================================================
-- Purpose: Resolve a proposal's client entity from its public_token in a
-- single SECURITY DEFINER round-trip. Walks:
--   public.proposals.public_token → deal_id
--   → public.deals.event_id
--   → ops.events.client_entity_id
--
-- Why an RPC instead of a TS walk: ops.events has no direct grant to
-- service_role (PostgREST role used by getSystemClient()), so
-- `.schema('ops').from('events')` returns 42501 permission denied. This
-- RPC runs as postgres via SECURITY DEFINER and reads the column cleanly.
-- Matches CLAUDE.md rule 7: "Access via SECURITY DEFINER RPCs only" for
-- schemas not exposed to PostgREST.
--
-- Used by: src/shared/lib/client-portal/resolve-proposal-entity.ts, which in
-- turn is called by the proposal page first-touch flow and the
-- /api/client-portal/mint-from-proposal route handler.
--
-- Linked: docs/reference/client-portal-design.md §14.2, §14.4, §15.1
-- =============================================================================

CREATE OR REPLACE FUNCTION public.client_resolve_proposal_entity(
  p_public_token uuid
)
RETURNS TABLE (
  proposal_id      uuid,
  deal_id          uuid,
  event_id         uuid,
  client_entity_id uuid,
  workspace_id     uuid,
  proposal_status  text
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT
    p.id                  AS proposal_id,
    p.deal_id             AS deal_id,
    d.event_id            AS event_id,
    e.client_entity_id    AS client_entity_id,
    p.workspace_id        AS workspace_id,
    p.status::text        AS proposal_status
  FROM public.proposals p
  LEFT JOIN public.deals d ON d.id = p.deal_id
  LEFT JOIN ops.events e ON e.id = d.event_id
  WHERE p.public_token = p_public_token
  LIMIT 1;
$$;

COMMENT ON FUNCTION public.client_resolve_proposal_entity(uuid) IS
  'Resolves a proposal public_token to its client entity in one round-trip. SECURITY DEFINER so it can read ops.events, which has no service_role grant. Returns proposal_status so callers can gate on viewable states without a second query. See client-portal-design.md §14.4.';

REVOKE ALL ON FUNCTION public.client_resolve_proposal_entity(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_resolve_proposal_entity(uuid) FROM authenticated;


-- =============================================================================
-- END: Phase 0.5 Client Portal Proposal Entity Resolver
-- =============================================================================
