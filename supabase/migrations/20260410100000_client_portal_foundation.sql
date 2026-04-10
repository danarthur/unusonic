-- =============================================================================
-- Phase 0.5 — Client Portal Foundation
-- =============================================================================
-- Purpose: Foundation for the client portal (docs/reference/client-portal-design.md).
--
-- Introduces the entity-scoped session layer that clients use to access their
-- own proposals, invoices, and events without joining workspace_members.
-- Clients remain `directory.entities` with claimed_by_user_id set (Ghost Protocol).
--
-- This migration is read-safe in isolation: it adds new tables, functions, and
-- RLS policies. The only changes to existing schema are non-breaking:
--   1. CHECK constraint on ops.events.status (all existing rows are 'planned',
--      which is in the allowed vocabulary).
--   2. Expression index on directory.entities ((lower(attributes->>'email')))
--      for the forgot-my-link flow (§15.5).
--
-- Intentionally DOES NOT include:
--   - ops.events.client_portal_token        (Phase 1)
--   - finance.invoices.public_token          (Phase 1)
--   - Backfill of ops.events.client_entity_id (separate RPC, migration 3)
--   - Session CRUD RPCs (mint, rotate, revoke, issue_otp, verify_otp, claim)
--     → delivered in the next migration: client_portal_session_rpcs.sql
--
-- Linked: docs/reference/client-portal-design.md §14–§17
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. ops.events.status CHECK constraint (§14.2, §14.7.1)
-- -----------------------------------------------------------------------------
-- Formally defines the status vocabulary that compute_client_session_expiry()
-- depends on. Existing rows default to 'planned' and remain valid.

ALTER TABLE ops.events
  ADD CONSTRAINT events_status_check
  CHECK (status IN (
    'planned', 'confirmed', 'in_progress', 'completed', 'cancelled', 'archived'
  ));

COMMENT ON CONSTRAINT events_status_check ON ops.events IS
  'Vocabulary for session-lifetime calculation (§14.7.1). Session expiry excludes cancelled and archived events.';


-- -----------------------------------------------------------------------------
-- 2. directory.entities email expression index (§14.2, §15.5)
-- -----------------------------------------------------------------------------
-- Supports case-insensitive lookup by email from attributes JSONB.
-- Used by the forgot-my-link flow and OTP email matching.

CREATE INDEX IF NOT EXISTS entities_primary_email_idx
  ON directory.entities ((lower(attributes->>'email')))
  WHERE attributes ? 'email';

COMMENT ON INDEX directory.entities_primary_email_idx IS
  'Supports the client portal forgot-my-link flow (§15.5) and OTP issuance lookups (§15.2). Case-insensitive; only entities with an email attribute are indexed.';


-- -----------------------------------------------------------------------------
-- 3. public.client_portal_tokens — event-lifetime session cookie state
-- -----------------------------------------------------------------------------

CREATE TABLE public.client_portal_tokens (
  id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id       uuid        NOT NULL REFERENCES directory.entities(id) ON DELETE CASCADE,
  token_hash      text        NOT NULL UNIQUE CHECK (char_length(token_hash) = 64),
  source_kind     text        NOT NULL CHECK (source_kind IN ('proposal', 'invoice', 'event', 'magic_link')),
  source_id       uuid,
  device_id_hash  text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  expires_at      timestamptz NOT NULL,
  last_used_at    timestamptz,
  last_used_ip    inet,
  last_used_ua    text,
  created_ip      inet,
  revoked_at      timestamptz,
  revoked_by      uuid,
  revoked_reason  text CHECK (revoked_reason IN (
    'client_logout', 'vendor_kick', 'email_changed', 'source_revoked', 'entity_archived'
  ))
);

COMMENT ON TABLE public.client_portal_tokens IS
  'Entity-scoped session tokens for the client portal. Event-lifetime TTL via compute_client_session_expiry(). Raw token is never stored — only SHA-256 hash (64 hex chars). See §14.1 and §14.7.';

CREATE INDEX client_portal_tokens_entity_active_idx
  ON public.client_portal_tokens (entity_id)
  WHERE revoked_at IS NULL;

CREATE INDEX client_portal_tokens_source_active_idx
  ON public.client_portal_tokens (source_kind, source_id)
  WHERE revoked_at IS NULL;

CREATE INDEX client_portal_tokens_expires_at_idx
  ON public.client_portal_tokens (expires_at)
  WHERE revoked_at IS NULL;

ALTER TABLE public.client_portal_tokens ENABLE ROW LEVEL SECURITY;

-- No authenticated grants. No policies. Service-role only access via RPCs.
-- Presence of RLS + absence of policies = denies all except service_role.


-- -----------------------------------------------------------------------------
-- 4. public.client_portal_otp_challenges — short-lived 6-digit codes
-- -----------------------------------------------------------------------------

CREATE TABLE public.client_portal_otp_challenges (
  id            uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_id     uuid        NOT NULL REFERENCES directory.entities(id) ON DELETE CASCADE,
  email         text        NOT NULL,
  code_hash     text        NOT NULL CHECK (char_length(code_hash) = 64),
  purpose       text        NOT NULL CHECK (purpose IN (
    'magic_link_login', 'step_up_sign', 'step_up_pay', 'step_up_download', 'step_up_email_change'
  )),
  attempts      smallint    NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  expires_at    timestamptz NOT NULL,
  consumed_at   timestamptz,
  created_ip    inet,
  created_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_portal_otp_challenges IS
  'Short-lived OTP challenges for client portal step-up actions. 10-minute expiry, 5-attempt lockout per challenge, hashed at rest. Email is snapshotted at issue time (§15.2 edge case).';

CREATE INDEX client_portal_otp_entity_recent_idx
  ON public.client_portal_otp_challenges (entity_id, created_at DESC);

CREATE INDEX client_portal_otp_expires_at_pending_idx
  ON public.client_portal_otp_challenges (expires_at)
  WHERE consumed_at IS NULL;

ALTER TABLE public.client_portal_otp_challenges ENABLE ROW LEVEL SECURITY;

-- No authenticated grants. No policies. Service-role only access via RPCs.


-- -----------------------------------------------------------------------------
-- 5. public.client_portal_rate_limits — sliding window action log
-- -----------------------------------------------------------------------------

CREATE TABLE public.client_portal_rate_limits (
  id         bigserial   PRIMARY KEY,
  scope      text        NOT NULL CHECK (scope IN (
    'magic_link_email', 'magic_link_ip', 'otp_attempt_email', 'otp_attempt_ip'
  )),
  key        text        NOT NULL,
  action_at  timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_portal_rate_limits IS
  'Sliding-window rate limit log for client portal public endpoints. Rows older than 48h are pruned by a daily cleanup job (delivered in session_rpcs migration). Per §15.6 rate-limit specification.';

CREATE INDEX client_portal_rate_limits_scope_key_time_idx
  ON public.client_portal_rate_limits (scope, key, action_at DESC);

ALTER TABLE public.client_portal_rate_limits ENABLE ROW LEVEL SECURITY;

-- No authenticated grants. No policies. Service-role only access via RPCs.


-- -----------------------------------------------------------------------------
-- 6. public.client_portal_access_log — SOC2-aligned audit trail
-- -----------------------------------------------------------------------------

CREATE TABLE public.client_portal_access_log (
  id             bigserial   PRIMARY KEY,
  session_id     uuid,
  request_id     text,
  entity_id      uuid        NOT NULL,
  workspace_id   uuid        NOT NULL,
  resource_type  text        NOT NULL CHECK (resource_type IN (
    'proposal', 'invoice', 'event', 'portal_home', 'document', 'aion_query', 'sign_in', 'session'
  )),
  resource_id    uuid,
  action         text        NOT NULL CHECK (action IN (
    'view', 'sign', 'pay', 'download', 'message', 'aion_response',
    'claim_entity', 'session_revoke', 'otp_issue', 'otp_verify',
    'magic_link_issue', 'passkey_register', 'passkey_auth'
  )),
  actor_kind     text        NOT NULL CHECK (actor_kind IN (
    'anonymous_token', 'magic_link_session', 'claimed_user', 'service_role'
  )),
  actor_id       text,
  auth_method    text        CHECK (auth_method IN (
    'magic_link', 'otp', 'passkey', 'session_cookie', 'service_role'
  )),
  outcome        text        NOT NULL CHECK (outcome IN (
    'success', 'denied', 'throttled', 'error', 'session_device_drift'
  )),
  ip             inet,
  user_agent     text,
  metadata       jsonb       NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.client_portal_access_log IS
  'SOC2-aligned audit log for all client portal access. Minimum 1-year retention floor per invariant §14.6(5). Entity-level FK intentionally omitted to preserve the log on entity deletion.';

CREATE INDEX client_portal_access_log_entity_time_idx
  ON public.client_portal_access_log (entity_id, created_at DESC);

CREATE INDEX client_portal_access_log_workspace_time_idx
  ON public.client_portal_access_log (workspace_id, created_at DESC);

CREATE INDEX client_portal_access_log_session_idx
  ON public.client_portal_access_log (session_id)
  WHERE session_id IS NOT NULL;

ALTER TABLE public.client_portal_access_log ENABLE ROW LEVEL SECURITY;

-- Dual-read path: workspace members see their own workspace's log; claimed
-- clients see their own entity's log. Writes are service-role only.
CREATE POLICY client_portal_access_log_select_workspace_member
  ON public.client_portal_access_log FOR SELECT
  USING (workspace_id IN (SELECT get_my_workspace_ids()));

CREATE POLICY client_portal_access_log_select_claimed_client
  ON public.client_portal_access_log FOR SELECT
  USING (entity_id IN (SELECT public.get_my_client_entity_ids()));

GRANT SELECT ON public.client_portal_access_log TO authenticated;


-- -----------------------------------------------------------------------------
-- 7. Function: public.get_my_client_entity_ids()
-- -----------------------------------------------------------------------------
-- Mirrors get_my_workspace_ids() but scoped to client entities.
-- For anonymous (ghost) clients, auth.uid() is NULL and this returns empty.

CREATE OR REPLACE FUNCTION public.get_my_client_entity_ids()
RETURNS SETOF uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT id FROM directory.entities WHERE claimed_by_user_id = auth.uid();
END;
$$;

COMMENT ON FUNCTION public.get_my_client_entity_ids() IS
  'Client-portal RLS helper. Returns entities where claimed_by_user_id = auth.uid(). For anonymous (ghost) clients, auth.uid() is NULL and this returns empty. Mirrors the get_my_workspace_ids() pattern but scoped to client entities. See §14.3.';

GRANT EXECUTE ON FUNCTION public.get_my_client_entity_ids() TO authenticated;


-- -----------------------------------------------------------------------------
-- 8. Function: public.compute_client_session_expiry(uuid)
-- -----------------------------------------------------------------------------
-- Event-lifetime session TTL. Uses ops.events.ends_at (not starts_at) so
-- multi-day weddings and tours get 30 days post-tour, not 30 days post-tour-start.
-- Hard ceiling: 365 days. Floor: 30 days.

CREATE OR REPLACE FUNCTION public.compute_client_session_expiry(p_entity_id uuid)
RETURNS timestamptz
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  WITH latest AS (
    SELECT max(ends_at) AS last_ends_at
    FROM ops.events
    WHERE client_entity_id = p_entity_id
      AND ends_at > now()
      AND status NOT IN ('cancelled', 'archived')
  )
  SELECT LEAST(
    now() + interval '365 days',
    GREATEST(
      now() + interval '30 days',
      COALESCE(last_ends_at, now()) + interval '30 days'
    )
  )
  FROM latest;
$$;

COMMENT ON FUNCTION public.compute_client_session_expiry(uuid) IS
  'Event-lifetime session TTL. Returns max(now()+30d, latest_future_event_end+30d) capped at now()+365d. Generic CIAM products cannot do this because they do not know the client event dates; we do. See client-portal-design.md §14.7.';

GRANT EXECUTE ON FUNCTION public.compute_client_session_expiry(uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 9. Function: public.client_is_workspace_client(uuid, uuid)
-- -----------------------------------------------------------------------------
-- Authoritative "is this entity a client of this workspace?" check via the
-- cortex.relationships CLIENT edge. Used by Phase 0.5 backfill and future
-- cross-workspace auditing.

CREATE OR REPLACE FUNCTION public.client_is_workspace_client(
  p_entity_id    uuid,
  p_workspace_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM cortex.relationships r
    JOIN directory.entities src ON src.id = r.source_entity_id
    WHERE r.relationship_type = 'CLIENT'
      AND r.context_data->>'deleted_at' IS NULL
      AND src.owner_workspace_id = p_workspace_id
      AND r.target_entity_id = p_entity_id
  );
$$;

COMMENT ON FUNCTION public.client_is_workspace_client(uuid, uuid) IS
  'Authoritative "is this entity a client of this workspace?" check. Wraps the cortex.relationships CLIENT edge query. Source = vendor root entity, target = client. See §14.2.1.';

GRANT EXECUTE ON FUNCTION public.client_is_workspace_client(uuid, uuid) TO authenticated;


-- -----------------------------------------------------------------------------
-- 10. New client-view RLS policies on shared tables (§14.4)
-- -----------------------------------------------------------------------------
-- These ADD to existing workspace_member policies — a user gets access if
-- ANY policy grants it. Since get_my_client_entity_ids() returns empty for
-- non-claimed users, staff users gain/lose nothing; only claimed clients
-- gain access to their own data.

-- finance.invoices: direct bill_to_entity_id path (clean single-hop)
CREATE POLICY client_view_own_invoices
  ON finance.invoices FOR SELECT
  USING (bill_to_entity_id IN (SELECT public.get_my_client_entity_ids()));

-- ops.events: direct client_entity_id path
CREATE POLICY client_view_own_events
  ON ops.events FOR SELECT
  USING (client_entity_id IN (SELECT public.get_my_client_entity_ids()));

-- ops.projects: direct client_entity_id path
CREATE POLICY client_view_own_projects
  ON ops.projects FOR SELECT
  USING (client_entity_id IN (SELECT public.get_my_client_entity_ids()));

-- public.proposals: 3-hop via deal → event → client_entity_id
-- (public.deals has no direct client column; deals in lead stage with no event
--  yet are correctly NOT client-visible via RLS.)
CREATE POLICY client_view_own_proposals
  ON public.proposals FOR SELECT
  USING (
    deal_id IN (
      SELECT d.id
      FROM public.deals d
      JOIN ops.events e ON e.id = d.event_id
      WHERE e.client_entity_id IN (SELECT public.get_my_client_entity_ids())
    )
  );


-- -----------------------------------------------------------------------------
-- 11. Cascade-revoke trigger: proposals.public_token change → sessions revoked
-- -----------------------------------------------------------------------------
-- Enforces invariant §14.6(7). When a vendor rotates/regenerates a proposal's
-- public_token, every client_portal_tokens row minted from that source is
-- force-revoked. Trigger-enforced, not application-enforced.

CREATE OR REPLACE FUNCTION public.client_portal_cascade_revoke_on_proposal_token_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  IF OLD.public_token IS DISTINCT FROM NEW.public_token THEN
    UPDATE public.client_portal_tokens
       SET revoked_at = now(),
           revoked_reason = 'source_revoked'
     WHERE source_kind = 'proposal'
       AND source_id = OLD.id
       AND revoked_at IS NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER client_portal_cascade_revoke_on_proposal_token
  AFTER UPDATE OF public_token ON public.proposals
  FOR EACH ROW
  EXECUTE FUNCTION public.client_portal_cascade_revoke_on_proposal_token_change();

COMMENT ON TRIGGER client_portal_cascade_revoke_on_proposal_token ON public.proposals IS
  'Invariant §14.6(7): sessions minted from a proposal public_token are force-revoked when the source token changes. Defends against the "rotated token didn''t kick live sessions" failure mode.';


-- =============================================================================
-- END: Phase 0.5 Client Portal Foundation
-- =============================================================================
