-- =============================================================================
-- EMERGENCY SECURITY FIX — revoke anon/public EXECUTE on client_* RPCs
--
-- Discovered 2026-04-10 while writing the pgTAP negative test suite for the
-- client portal (design doc §16.3a(2)). All 14 client_* SECURITY DEFINER
-- functions in the public schema had EXECUTE granted to the `anon` role by
-- default (Postgres grants EXECUTE to PUBLIC on CREATE FUNCTION, and the
-- Phase 0.5 migration that created these functions never revoked it).
--
-- Confirmed exploitable:
--
--   1. Anonymous caller (no auth, only the public anon key) can call
--      `client_mint_session_token(entity_id, 'proposal', null, ip, null)`
--      with any entity UUID and receive a live, valid session token. Setting
--      that as the `unusonic_client_session` cookie grants full access to
--      the target client's /client/home, /client/proposal/*, /client/invoice/*,
--      /client/event/* — proposals, invoices, events, PM contact card.
--
--   2. Anonymous caller can call `client_revoke_all_for_entity(entity, ws, ...)`
--      and revoke sessions in any workspace — denial-of-service against the
--      client portal from an unauthenticated origin.
--
--   3. The other client_* RPCs (mint/rotate/revoke/otp/claim/log/check) are
--      all similarly reachable and their attack surface ranges from DoS to
--      session hijacking to email-spam-via-OTP.
--
-- Intended caller surface:
--
--   All client_* RPCs in this family are meant to be invoked from server
--   code only, through the system client (`getSystemClient`) which connects
--   as `service_role`. The route handlers (e.g. `/api/client-portal/...`)
--   resolve the request, enforce their own scoping, and then call the RPCs.
--   There is no legitimate client-side caller path for any of them.
--
--   The one exception, `client_is_workspace_client`, is an `authenticated`-
--   safe predicate used by staff-dashboard code; its grant is left alone.
--
-- Fix shape:
--
--   For every client_* function in this list, REVOKE EXECUTE FROM PUBLIC
--   and FROM anon. service_role's grant is untouched. authenticated gets
--   an explicit REVOKE as well for defense-in-depth — no current code
--   path invokes these RPCs as an authenticated user, and if some future
--   dashboard wiring needs it, that can be re-granted explicitly in a
--   separate migration that also adds the `is_workspace_member()` guard
--   inside the function body.
--
-- Companion work:
--
--   - pgTAP negative tests covering both the RPC bypass hole AND the
--     defense-in-depth in-function guards are in
--     supabase/tests/database/00600-client-portal-rpc-negative.test.sql.
--   - A separate migration may add `is_workspace_member()` checks inside
--     the revoke RPCs once the tests are re-run and we know exactly which
--     guards each function needs.
-- =============================================================================

-- Helper: apply the same REVOKE pattern to one function. Using DO blocks
-- so we can loop a list without repeating GRANT/REVOKE spellings.
DO $$
DECLARE
  v_func text;
  v_func_list text[] := ARRAY[
    'client_mint_session_token',
    'client_rotate_session_token',
    'client_revoke_session_token',
    'client_revoke_all_for_entity',
    'client_revoke_session_token_device',
    'client_issue_otp_challenge',
    'client_verify_otp',
    'client_claim_entity',
    'client_check_rate_limit',
    'client_log_access',
    'client_resolve_proposal_entity',
    'client_portal_rate_limit_prune'
  ];
  v_signature text;
BEGIN
  FOREACH v_func IN ARRAY v_func_list LOOP
    -- Iterate over every overload of the function name in public schema.
    FOR v_signature IN
      SELECT format('public.%I(%s)', p.proname, pg_get_function_identity_arguments(p.oid))
      FROM pg_proc p
      WHERE p.proname = v_func
        AND p.pronamespace = 'public'::regnamespace
    LOOP
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', v_signature);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', v_signature);
      EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM authenticated', v_signature);
      -- Re-assert service_role for clarity (it already has it, but this
      -- documents the one legitimate caller in-migration).
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', v_signature);
    END LOOP;
  END LOOP;
END $$;

-- client_is_workspace_client is deliberately excluded from the revoke
-- above. It's a workspace-member-facing predicate used by staff dashboard
-- code to answer "is this entity a client of my workspace?" and has always
-- been intended as an authenticated-role grant. Leaving it alone.
--
-- client_portal_cascade_revoke_on_proposal_token_change is a trigger
-- helper. Trigger bodies execute as the table owner regardless of the
-- caller's EXECUTE privilege, so stripping grants on the function would
-- not prevent the trigger from firing. Leaving it alone too.
