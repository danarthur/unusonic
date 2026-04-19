-- =============================================================================
-- SMS OTP sign-in — workspace opt-in + attempt log + code table (Login Redesign, Phase 6)
--
-- Design spec: docs/reference/login-redesign-design.md §7.
-- Implementation plan: docs/reference/login-redesign-implementation-plan.md, Phase 6.
--
-- This migration introduces three things:
--   A. public.workspaces.sms_signin_enabled  — per-workspace opt-in flag (default false).
--   B. public.sms_otp_attempts               — rate-limit attempt log (5/hr/user, 10/hr/IP).
--   C. public.sms_otp_codes                  — short-lived hashed OTP codes (10-min expiry).
--   D. public.purge_expired_sms_otp_codes()  — cron-callable cleanup (service role only).
--
-- Both new tables live in `public` because they pre-date the finance/ops/etc.
-- five-schema split and are part of the `auth` domain; the `auth` schema itself
-- is Supabase-managed, and our custom auth surfaces (passkeys, guardians,
-- recovery_shards, invitations) are the established precedent for this.
--
-- Security posture (MANDATORY — per memory note feedback_postgres_function_grants.md):
--   - sms_otp_codes has NO SELECT/INSERT/UPDATE/DELETE policy for any role
--     except service_role. We REVOKE all table privileges from PUBLIC, anon,
--     authenticated so that even if a future RLS policy is added by mistake,
--     the grant gate still blocks client reads. RLS is enabled for defense in
--     depth.
--   - sms_otp_attempts has user-scoped SELECT only (for debug / self-audit);
--     writes are service-role only.
--   - purge_expired_sms_otp_codes is SECURITY DEFINER and REVOKEd from anon —
--     without the revoke, anon can run it (even though the deletion is safe,
--     triggering it from the public side isn't the contract we want).
-- =============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- A. Workspace opt-in flag
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.workspaces
  ADD COLUMN IF NOT EXISTS sms_signin_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.workspaces.sms_signin_enabled IS
  'When true, members of this workspace may receive a 6-digit SMS sign-in code as a fallback to the email magic link. Gated by AUTH_V2_SMS feature flag; default false. Toggled by workspace owner/admin in settings/security.';

-- No new RLS required: workspaces already has owner/admin-scoped policies.

-- ─────────────────────────────────────────────────────────────────────────────
-- B. Rate-limit attempt log
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sms_otp_attempts (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  ip_hash    text NOT NULL,
  sent_at    timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sms_otp_attempts IS
  'Rate-limit attempt log for SMS OTP send. Each row records a successful Twilio send. Edge function counts recent rows to enforce 5/hr/user and 10/hr/ip. Failed sends MUST NOT insert here (otherwise Twilio outage burns through quota).';

CREATE INDEX IF NOT EXISTS sms_otp_attempts_user_id_sent_at_idx
  ON public.sms_otp_attempts (user_id, sent_at DESC);
CREATE INDEX IF NOT EXISTS sms_otp_attempts_ip_hash_sent_at_idx
  ON public.sms_otp_attempts (ip_hash, sent_at DESC);

ALTER TABLE public.sms_otp_attempts ENABLE ROW LEVEL SECURITY;

-- SELECT: user can see their own attempts only. This is for self-audit and
-- potential future UI ("you've requested 3 codes in the last hour"); it does
-- NOT leak anything the user couldn't already observe.
DROP POLICY IF EXISTS sms_otp_attempts_own_select ON public.sms_otp_attempts;
CREATE POLICY sms_otp_attempts_own_select
  ON public.sms_otp_attempts
  FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- No INSERT / UPDATE / DELETE policy — service role bypasses RLS from the
-- edge function. This is the deliberate posture.

-- ─────────────────────────────────────────────────────────────────────────────
-- C. Short-lived hashed OTP codes
-- ─────────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS public.sms_otp_codes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code_hash    text NOT NULL,
  attempts     integer NOT NULL DEFAULT 0,
  expires_at   timestamptz NOT NULL,
  consumed_at  timestamptz,
  created_at   timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.sms_otp_codes IS
  'Hashed 6-digit OTP codes sent via Twilio. code_hash = SHA-256(code + user_id + SMS_OTP_HASH_SALT). 10-minute expiry. attempts increments on every verify call; ≥5 blocks further verification. RLS locked to service role — no client can SELECT or INSERT even with a valid JWT.';

CREATE INDEX IF NOT EXISTS sms_otp_codes_user_id_expires_idx
  ON public.sms_otp_codes (user_id, expires_at DESC);

ALTER TABLE public.sms_otp_codes ENABLE ROW LEVEL SECURITY;

-- No policies at all — RLS enabled without SELECT/INSERT/UPDATE/DELETE
-- policies means non-service-role roles get zero rows back. Defense in depth
-- alongside the REVOKE below.

REVOKE ALL ON TABLE public.sms_otp_codes FROM PUBLIC;
REVOKE ALL ON TABLE public.sms_otp_codes FROM anon;
REVOKE ALL ON TABLE public.sms_otp_codes FROM authenticated;

-- Same hardening on the attempt log — only service_role writes; the user-scoped
-- SELECT policy above is the only client-visible path. We still REVOKE write
-- grants explicitly so a future misconfigured GRANT doesn't open a hole.
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sms_otp_attempts FROM PUBLIC;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sms_otp_attempts FROM anon;
REVOKE INSERT, UPDATE, DELETE ON TABLE public.sms_otp_attempts FROM authenticated;

-- ─────────────────────────────────────────────────────────────────────────────
-- D. Cleanup function (cron-callable)
-- ─────────────────────────────────────────────────────────────────────────────
--
-- Deletes expired codes older than 1 hour past expiry (keeping a buffer so
-- a late-arriving verify still returns "expired" rather than "invalid"). Safe
-- to call frequently; idempotent.

CREATE OR REPLACE FUNCTION public.purge_expired_sms_otp_codes() RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  DELETE FROM public.sms_otp_codes
   WHERE expires_at < now() - interval '1 hour';
$$;

COMMENT ON FUNCTION public.purge_expired_sms_otp_codes() IS
  'Deletes SMS OTP code rows whose expires_at is more than one hour in the past. SECURITY DEFINER; REVOKED from PUBLIC and anon. Intended for scheduled cron — call via service role only.';

-- MANDATORY grants discipline (per memory note feedback_postgres_function_grants.md).
-- CREATE FUNCTION grants EXECUTE to PUBLIC by default. This function is safe
-- (only deletes expired rows) but anon should not trigger it.
REVOKE ALL ON FUNCTION public.purge_expired_sms_otp_codes() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.purge_expired_sms_otp_codes() FROM anon;
GRANT EXECUTE ON FUNCTION public.purge_expired_sms_otp_codes() TO service_role;

-- =============================================================================
-- Audit queries (run post-migration to verify the security posture):
--
--   -- anon must NOT be able to execute purge
--   SELECT has_function_privilege('anon',
--     'public.purge_expired_sms_otp_codes()', 'EXECUTE');
--   -- expected: false
--
--   -- anon must NOT be able to SELECT sms_otp_codes
--   SELECT has_table_privilege('anon', 'public.sms_otp_codes', 'SELECT');
--   -- expected: false
--
--   -- authenticated must NOT be able to SELECT sms_otp_codes
--   SELECT has_table_privilege('authenticated', 'public.sms_otp_codes', 'SELECT');
--   -- expected: false
--
--   -- anon must NOT be able to INSERT sms_otp_attempts
--   SELECT has_table_privilege('anon', 'public.sms_otp_attempts', 'INSERT');
--   -- expected: false
--
--   -- workspaces.sms_signin_enabled default is false
--   SELECT column_default FROM information_schema.columns
--    WHERE table_schema = 'public' AND table_name = 'workspaces'
--      AND column_name = 'sms_signin_enabled';
--   -- expected: 'false'
-- =============================================================================
