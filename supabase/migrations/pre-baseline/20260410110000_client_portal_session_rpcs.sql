-- =============================================================================
-- Phase 0.5 — Client Portal Session CRUD RPCs
-- =============================================================================
-- Operational layer on top of the foundation migration. All RPCs are
-- SECURITY DEFINER and return structured result types (no exceptions for
-- business-logic failures — callers branch on { ok, reason }).
--
-- All RPCs are granted to `service_role` only. The app-side server helpers
-- (src/shared/lib/client-portal/*) call them via getSystemClient(). No
-- authenticated or anon grants — these functions are the server's private
-- API for client portal state.
--
-- Contents:
--   1. client_mint_session_token        — create a new session row + raw token
--   2. client_rotate_session_token      — silent refresh on each use
--   3. client_revoke_session_token      — client-initiated logout
--   4. client_revoke_all_for_entity     — vendor kill switch (bulk)
--   5. client_revoke_session_token_device — vendor kill switch (surgical)
--   6. client_check_rate_limit          — sliding window limiter
--   7. client_issue_otp_challenge       — step-up init
--   8. client_verify_otp                — step-up completion
--   9. client_claim_entity              — ghost → claimed atomic promotion
--   10. client_log_access               — audit writer
--   11. client_portal_rate_limit_prune  — daily cleanup job
--
-- Linked: docs/reference/client-portal-design.md §15 (flows), §16.4 (RPC table)
-- =============================================================================


-- -----------------------------------------------------------------------------
-- 1. client_mint_session_token
-- -----------------------------------------------------------------------------
-- Creates a new session row. Raw token is returned exactly once — caller is
-- responsible for setting the cookie immediately and never logging the value.
-- Expiry is computed via compute_client_session_expiry(entity_id).

CREATE OR REPLACE FUNCTION public.client_mint_session_token(
  p_entity_id       uuid,
  p_source_kind     text,
  p_source_id       uuid,
  p_ip              inet DEFAULT NULL,
  p_device_id_hash  text DEFAULT NULL
)
RETURNS TABLE (token_id uuid, token_raw text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_token_raw   text;
  v_token_hash  text;
  v_expires_at  timestamptz;
  v_token_id    uuid;
BEGIN
  -- Generate a 32-byte (64 hex char) random token
  v_token_raw  := encode(gen_random_bytes(32), 'hex');
  v_token_hash := encode(digest(v_token_raw, 'sha256'), 'hex');
  v_expires_at := public.compute_client_session_expiry(p_entity_id);

  INSERT INTO public.client_portal_tokens (
    entity_id, token_hash, source_kind, source_id,
    device_id_hash, expires_at, created_ip
  )
  VALUES (
    p_entity_id, v_token_hash, p_source_kind, p_source_id,
    p_device_id_hash, v_expires_at, p_ip
  )
  RETURNING id INTO v_token_id;

  RETURN QUERY SELECT v_token_id, v_token_raw, v_expires_at;
END;
$$;

COMMENT ON FUNCTION public.client_mint_session_token(uuid, text, uuid, inet, text) IS
  'Creates a new client portal session token. Raw token is returned once — never stored. See §15.1.';

REVOKE ALL ON FUNCTION public.client_mint_session_token(uuid, text, uuid, inet, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_mint_session_token(uuid, text, uuid, inet, text) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 2. client_rotate_session_token
-- -----------------------------------------------------------------------------
-- Called on every successful session use. Bumps last_used_at/last_used_ip
-- and recomputes expires_at per the event-lifetime formula. Silent.

CREATE OR REPLACE FUNCTION public.client_rotate_session_token(
  p_token_hash  text,
  p_ip          inet DEFAULT NULL,
  p_user_agent  text DEFAULT NULL
)
RETURNS TABLE (ok boolean, reason text, entity_id uuid, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_row         public.client_portal_tokens;
  v_new_expiry  timestamptz;
BEGIN
  SELECT * INTO v_row
  FROM public.client_portal_tokens
  WHERE token_hash = p_token_hash;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found', NULL::uuid, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_row.revoked_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'revoked', v_row.entity_id, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_row.expires_at < now() THEN
    RETURN QUERY SELECT false, 'expired', v_row.entity_id, v_row.expires_at;
    RETURN;
  END IF;

  v_new_expiry := public.compute_client_session_expiry(v_row.entity_id);

  UPDATE public.client_portal_tokens
     SET last_used_at = now(),
         last_used_ip = p_ip,
         last_used_ua = p_user_agent,
         expires_at   = v_new_expiry
   WHERE id = v_row.id;

  RETURN QUERY SELECT true, 'ok'::text, v_row.entity_id, v_new_expiry;
END;
$$;

COMMENT ON FUNCTION public.client_rotate_session_token(text, inet, text) IS
  'Silent session rotation on every use. Recomputes event-lifetime expiry. See §15.1.';

REVOKE ALL ON FUNCTION public.client_rotate_session_token(text, inet, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_rotate_session_token(text, inet, text) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 3. client_revoke_session_token
-- -----------------------------------------------------------------------------
-- Client-initiated logout. Idempotent.

CREATE OR REPLACE FUNCTION public.client_revoke_session_token(
  p_token_hash  text,
  p_reason      text DEFAULT 'client_logout'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.client_portal_tokens
     SET revoked_at = COALESCE(revoked_at, now()),
         revoked_reason = COALESCE(revoked_reason, p_reason)
   WHERE token_hash = p_token_hash
     AND revoked_at IS NULL;

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.client_revoke_session_token(text, text) IS
  'Client-initiated logout. Revokes the session identified by token_hash. Idempotent.';

REVOKE ALL ON FUNCTION public.client_revoke_session_token(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_revoke_session_token(text, text) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 4. client_revoke_all_for_entity
-- -----------------------------------------------------------------------------
-- Vendor kill switch: revoke every live session for an entity.

CREATE OR REPLACE FUNCTION public.client_revoke_all_for_entity(
  p_entity_id    uuid,
  p_workspace_id uuid,
  p_revoked_by   uuid,
  p_reason       text DEFAULT 'vendor_kick'
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_revoked_count integer;
BEGIN
  UPDATE public.client_portal_tokens
     SET revoked_at     = now(),
         revoked_reason = p_reason,
         revoked_by     = p_revoked_by
   WHERE entity_id = p_entity_id
     AND revoked_at IS NULL
     -- Defense in depth: only revoke if the caller's workspace owns the entity
     AND EXISTS (
       SELECT 1 FROM directory.entities e
       WHERE e.id = p_entity_id
         AND e.owner_workspace_id = p_workspace_id
     );

  GET DIAGNOSTICS v_revoked_count = ROW_COUNT;
  RETURN v_revoked_count;
END;
$$;

COMMENT ON FUNCTION public.client_revoke_all_for_entity(uuid, uuid, uuid, text) IS
  'Vendor-initiated bulk revoke for an entity. Only effective when the caller workspace owns the entity.';

REVOKE ALL ON FUNCTION public.client_revoke_all_for_entity(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_revoke_all_for_entity(uuid, uuid, uuid, text) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 5. client_revoke_session_token_device
-- -----------------------------------------------------------------------------
-- Surgical: kick one device. Used by the vendor dashboard "sign this session out".

CREATE OR REPLACE FUNCTION public.client_revoke_session_token_device(
  p_workspace_id uuid,
  p_entity_id    uuid,
  p_session_id   uuid,
  p_revoked_by   uuid,
  p_reason       text DEFAULT 'vendor_kick'
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  UPDATE public.client_portal_tokens
     SET revoked_at     = now(),
         revoked_reason = p_reason,
         revoked_by     = p_revoked_by
   WHERE id = p_session_id
     AND entity_id = p_entity_id
     AND revoked_at IS NULL
     AND EXISTS (
       SELECT 1 FROM directory.entities e
       WHERE e.id = p_entity_id
         AND e.owner_workspace_id = p_workspace_id
     );

  RETURN FOUND;
END;
$$;

COMMENT ON FUNCTION public.client_revoke_session_token_device(uuid, uuid, uuid, uuid, text) IS
  'Vendor-initiated single-device kick. Surgical alternative to client_revoke_all_for_entity.';

REVOKE ALL ON FUNCTION public.client_revoke_session_token_device(uuid, uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_revoke_session_token_device(uuid, uuid, uuid, uuid, text) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 6. client_check_rate_limit
-- -----------------------------------------------------------------------------
-- Sliding window limiter. Counts non-expired actions within the window.
-- Writes a row on each check (tracking the action). Callers should call this
-- BEFORE performing the action, not after.

CREATE OR REPLACE FUNCTION public.client_check_rate_limit(
  p_scope           text,
  p_key             text,
  p_limit           integer,
  p_window_seconds  integer
)
RETURNS TABLE (allowed boolean, current_count integer, retry_after_seconds integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_count        integer;
  v_oldest       timestamptz;
  v_retry_after  integer;
BEGIN
  SELECT count(*), min(action_at)
    INTO v_count, v_oldest
  FROM public.client_portal_rate_limits
  WHERE scope = p_scope
    AND key = p_key
    AND action_at > now() - make_interval(secs => p_window_seconds);

  IF v_count >= p_limit THEN
    v_retry_after := GREATEST(
      0,
      p_window_seconds - EXTRACT(EPOCH FROM (now() - v_oldest))::integer
    );
    RETURN QUERY SELECT false, v_count, v_retry_after;
    RETURN;
  END IF;

  -- Record this action
  INSERT INTO public.client_portal_rate_limits (scope, key, action_at)
  VALUES (p_scope, p_key, now());

  RETURN QUERY SELECT true, v_count + 1, 0;
END;
$$;

COMMENT ON FUNCTION public.client_check_rate_limit(text, text, integer, integer) IS
  'Sliding window rate limiter. Writes on check. Returns { allowed, current_count, retry_after_seconds }. See §15.6.';

REVOKE ALL ON FUNCTION public.client_check_rate_limit(text, text, integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_check_rate_limit(text, text, integer, integer) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 7. client_issue_otp_challenge
-- -----------------------------------------------------------------------------
-- Creates a new OTP challenge. Raw 6-digit code is returned exactly once.
-- Caller is responsible for emailing the code and never logging it.
-- Pre-condition: caller has already passed client_check_rate_limit for
-- 'magic_link_email' scope.

CREATE OR REPLACE FUNCTION public.client_issue_otp_challenge(
  p_entity_id  uuid,
  p_email      text,
  p_purpose    text,
  p_ip         inet DEFAULT NULL
)
RETURNS TABLE (challenge_id uuid, code_raw text, expires_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_code_raw   text;
  v_code_hash  text;
  v_challenge_id uuid;
  v_expires_at timestamptz;
  v_bytes      bytea;
BEGIN
  -- 6-digit code derived from cryptographic random bytes (not random()).
  -- 4 bytes = 32 bits; modulo 1e6 has negligible bias for 6-digit codes.
  v_bytes := gen_random_bytes(4);
  v_code_raw := lpad(
    ((get_byte(v_bytes, 0) * 16777216
      + get_byte(v_bytes, 1) * 65536
      + get_byte(v_bytes, 2) * 256
      + get_byte(v_bytes, 3)) % 1000000)::text,
    6, '0'
  );
  v_code_hash := encode(digest(v_code_raw, 'sha256'), 'hex');
  v_expires_at := now() + interval '10 minutes';

  INSERT INTO public.client_portal_otp_challenges (
    entity_id, email, code_hash, purpose, expires_at, created_ip
  )
  VALUES (
    p_entity_id, lower(p_email), v_code_hash, p_purpose, v_expires_at, p_ip
  )
  RETURNING id INTO v_challenge_id;

  RETURN QUERY SELECT v_challenge_id, v_code_raw, v_expires_at;
END;
$$;

COMMENT ON FUNCTION public.client_issue_otp_challenge(uuid, text, text, inet) IS
  'Creates a new OTP challenge. Raw code is returned once. 10-minute expiry, 5-attempt lockout enforced by client_verify_otp. See §15.2.';

REVOKE ALL ON FUNCTION public.client_issue_otp_challenge(uuid, text, text, inet) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_issue_otp_challenge(uuid, text, text, inet) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 8. client_verify_otp
-- -----------------------------------------------------------------------------
-- Verifies a code against a challenge. On success, marks consumed_at.
-- On failure, increments attempts. At 5 attempts, the challenge is locked
-- (attempts cannot be decremented; a new challenge must be issued).

CREATE OR REPLACE FUNCTION public.client_verify_otp(
  p_challenge_id uuid,
  p_code         text,
  p_ip           inet DEFAULT NULL
)
RETURNS TABLE (
  ok              boolean,
  reason          text,
  entity_id       uuid,
  email           text,
  purpose         text,
  already_claimed boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public', 'extensions'
AS $$
DECLARE
  v_row         public.client_portal_otp_challenges;
  v_code_hash   text;
  v_claimed     boolean;
BEGIN
  SELECT * INTO v_row
  FROM public.client_portal_otp_challenges
  WHERE id = p_challenge_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'not_found'::text, NULL::uuid, NULL::text, NULL::text, NULL::boolean;
    RETURN;
  END IF;

  IF v_row.consumed_at IS NOT NULL THEN
    RETURN QUERY SELECT false, 'already_consumed'::text, v_row.entity_id, v_row.email, v_row.purpose, NULL::boolean;
    RETURN;
  END IF;

  IF v_row.expires_at < now() THEN
    RETURN QUERY SELECT false, 'expired'::text, v_row.entity_id, v_row.email, v_row.purpose, NULL::boolean;
    RETURN;
  END IF;

  IF v_row.attempts >= 5 THEN
    RETURN QUERY SELECT false, 'locked'::text, v_row.entity_id, v_row.email, v_row.purpose, NULL::boolean;
    RETURN;
  END IF;

  v_code_hash := encode(digest(p_code, 'sha256'), 'hex');

  IF v_code_hash IS DISTINCT FROM v_row.code_hash THEN
    UPDATE public.client_portal_otp_challenges
       SET attempts = attempts + 1
     WHERE id = p_challenge_id;
    RETURN QUERY SELECT false, 'bad_code'::text, v_row.entity_id, v_row.email, v_row.purpose, NULL::boolean;
    RETURN;
  END IF;

  -- Success: consume challenge
  UPDATE public.client_portal_otp_challenges
     SET consumed_at = now()
   WHERE id = p_challenge_id;

  SELECT (claimed_by_user_id IS NOT NULL) INTO v_claimed
  FROM directory.entities
  WHERE id = v_row.entity_id;

  RETURN QUERY SELECT true, 'ok'::text, v_row.entity_id, v_row.email, v_row.purpose, v_claimed;
END;
$$;

COMMENT ON FUNCTION public.client_verify_otp(uuid, text, inet) IS
  'Verifies an OTP code. On success, atomically consumes the challenge and reports whether the entity is already claimed. See §15.2.';

REVOKE ALL ON FUNCTION public.client_verify_otp(uuid, text, inet) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_verify_otp(uuid, text, inet) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 9. client_claim_entity
-- -----------------------------------------------------------------------------
-- Atomic ghost → claimed promotion. Pre-condition: caller has verified via
-- client_verify_otp in the same request (invariant §14.6(3)). This function
-- does NOT itself verify an OTP — it trusts the caller's flow.
-- Fails if the entity is already claimed by a different user.

CREATE OR REPLACE FUNCTION public.client_claim_entity(
  p_entity_id    uuid,
  p_auth_user_id uuid
)
RETURNS TABLE (ok boolean, reason text, claimed_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_existing uuid;
BEGIN
  SELECT claimed_by_user_id INTO v_existing
  FROM directory.entities
  WHERE id = p_entity_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RETURN QUERY SELECT false, 'entity_not_found'::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_existing IS NOT NULL AND v_existing <> p_auth_user_id THEN
    RETURN QUERY SELECT false, 'already_claimed_by_other'::text, NULL::timestamptz;
    RETURN;
  END IF;

  IF v_existing = p_auth_user_id THEN
    RETURN QUERY SELECT true, 'already_claimed_by_self'::text, now();
    RETURN;
  END IF;

  UPDATE directory.entities
     SET claimed_by_user_id = p_auth_user_id,
         updated_at = now()
   WHERE id = p_entity_id;

  RETURN QUERY SELECT true, 'ok'::text, now();
END;
$$;

COMMENT ON FUNCTION public.client_claim_entity(uuid, uuid) IS
  'Atomic ghost → claimed promotion. Requires the caller to have just verified an OTP (invariant §14.6(3)). Double-claim safe: idempotent when the entity is already claimed by the same user.';

REVOKE ALL ON FUNCTION public.client_claim_entity(uuid, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_claim_entity(uuid, uuid) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 10. client_log_access
-- -----------------------------------------------------------------------------
-- Wrapper for inserting audit log rows. Keeps the insert path centralized so
-- callers can't accidentally skip required fields.

CREATE OR REPLACE FUNCTION public.client_log_access(
  p_entity_id     uuid,
  p_workspace_id  uuid,
  p_resource_type text,
  p_action        text,
  p_actor_kind    text,
  p_outcome       text,
  p_session_id    uuid DEFAULT NULL,
  p_request_id    text DEFAULT NULL,
  p_resource_id   uuid DEFAULT NULL,
  p_actor_id      text DEFAULT NULL,
  p_auth_method   text DEFAULT NULL,
  p_ip            inet DEFAULT NULL,
  p_user_agent    text DEFAULT NULL,
  p_metadata      jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = 'public'
AS $$
  INSERT INTO public.client_portal_access_log (
    session_id, request_id, entity_id, workspace_id,
    resource_type, resource_id, action,
    actor_kind, actor_id, auth_method, outcome,
    ip, user_agent, metadata
  )
  VALUES (
    p_session_id, p_request_id, p_entity_id, p_workspace_id,
    p_resource_type, p_resource_id, p_action,
    p_actor_kind, p_actor_id, p_auth_method, p_outcome,
    p_ip, p_user_agent, p_metadata
  );
$$;

COMMENT ON FUNCTION public.client_log_access(uuid, uuid, text, text, text, text, uuid, text, uuid, text, text, inet, text, jsonb) IS
  'Centralized audit log writer. All client portal access events route through here.';

REVOKE ALL ON FUNCTION public.client_log_access(uuid, uuid, text, text, text, text, uuid, text, uuid, text, text, inet, text, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_log_access(uuid, uuid, text, text, text, text, uuid, text, uuid, text, text, inet, text, jsonb) FROM authenticated;


-- -----------------------------------------------------------------------------
-- 11. client_portal_rate_limit_prune
-- -----------------------------------------------------------------------------
-- Daily cleanup: delete rate_limits rows older than 48h. No point keeping
-- them — the widest window we check is 24h, so 48h gives us a comfortable
-- retention buffer without bloating the table.

CREATE OR REPLACE FUNCTION public.client_portal_rate_limit_prune()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.client_portal_rate_limits
  WHERE action_at < now() - interval '48 hours';

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

COMMENT ON FUNCTION public.client_portal_rate_limit_prune() IS
  'Prunes client_portal_rate_limits rows older than 48h. Scheduled via pg_cron in a follow-up migration (or called manually from a cron worker for now).';

REVOKE ALL ON FUNCTION public.client_portal_rate_limit_prune() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.client_portal_rate_limit_prune() FROM authenticated;


-- =============================================================================
-- END: Phase 0.5 Client Portal Session CRUD RPCs
-- =============================================================================
