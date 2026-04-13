-- =============================================================================
-- Bridge RPC grant hardening
--
-- Companion to migration 20260410160000_revoke_anon_exec_client_portal_rpcs.sql,
-- which fixed the equivalent hole in the client_portal RPC family. This
-- migration applies the same discipline to the Bridge RPCs I added earlier
-- today (20260410120000 and 20260410130000).
--
-- Problem: Postgres's CREATE FUNCTION grants EXECUTE to PUBLIC by default,
-- and on newly-created functions Supabase's default privileges additionally
-- grant EXECUTE to `authenticated`. A bare `REVOKE ALL FROM PUBLIC` only
-- removes the PUBLIC grant — it does NOT touch the named `authenticated`
-- role, which is treated as a separate grant path.
--
-- Current state, verified before this migration:
--
--   generate_bridge_pairing_code:  anon=false, authed=true,  service=true  (SAFE)
--   check_bridge_pair_rate_limit:  anon=false, authed=true,  service=true  (UNSAFE)
--
-- `generate_bridge_pairing_code` legitimately needs authenticated (the
-- server action calls it via the user's Supabase session). We hit it
-- explicitly below as defense-in-depth against a future CREATE OR REPLACE
-- silently resetting grants.
--
-- `check_bridge_pair_rate_limit` must NOT be callable by authenticated.
-- The only legitimate caller is the Bridge pair route handler running as
-- service_role. If authenticated users can reach it, they can pass an
-- arbitrary `p_client_ip inet` and burn the pairing rate limit for any
-- IP of their choosing — a targeted 1-hour DoS against any victim's
-- ability to pair a new Bridge install.
-- =============================================================================

-- check_bridge_pair_rate_limit — service_role only.
REVOKE EXECUTE ON FUNCTION public.check_bridge_pair_rate_limit(inet)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.check_bridge_pair_rate_limit(inet)
  TO service_role;

-- generate_bridge_pairing_code — authenticated stays (portal calls it via
-- the generateBridgePairingCode server action using the user's session),
-- but we explicitly deny anon so a future CREATE OR REPLACE can't re-open
-- the hole that the earlier create_bridge_tables migration closed.
REVOKE EXECUTE ON FUNCTION public.generate_bridge_pairing_code(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_bridge_pairing_code(uuid, uuid)
  TO authenticated, service_role;
