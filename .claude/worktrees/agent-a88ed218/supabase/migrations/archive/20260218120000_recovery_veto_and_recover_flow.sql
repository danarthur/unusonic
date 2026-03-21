-- A. Cancel token for veto link (one-time, no login required)
ALTER TABLE public.recovery_requests
  ADD COLUMN IF NOT EXISTS cancel_token_hash text UNIQUE;

COMMENT ON COLUMN public.recovery_requests.cancel_token_hash IS 'SHA-256 hash of the one-time cancel token sent to owner email; used for /auth/recover/cancel?token=...';

-- Resolve user id by email for recovery flow (backend only).
CREATE OR REPLACE FUNCTION public.get_user_id_by_email(user_email text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = auth, public
AS $$
DECLARE
  uid uuid;
BEGIN
  IF user_email IS NULL OR length(trim(user_email)) = 0 THEN
    RETURN NULL;
  END IF;
  SELECT id INTO uid FROM auth.users WHERE lower(trim(email)) = lower(trim(user_email)) LIMIT 1;
  RETURN uid;
END;
$$;
COMMENT ON FUNCTION public.get_user_id_by_email(text) IS 'Returns auth.users.id for the given email. Backend only (recovery flow).';
