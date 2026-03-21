-- Recovery requests with 48h timelock; owner can cancel (silent takeover defense).
-- Challenge cleanup function for pg_cron or Edge Function.

CREATE TABLE public.recovery_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  timelock_until timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled')),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.recovery_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Owners manage own recovery requests"
  ON public.recovery_requests FOR ALL
  USING (auth.uid() = owner_id)
  WITH CHECK (auth.uid() = owner_id);

CREATE OR REPLACE FUNCTION public.cleanup_webauthn_challenges()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE rv integer;
BEGIN
  DELETE FROM public.webauthn_challenges
  WHERE created_at < now() - interval '5 minutes';
  GET DIAGNOSTICS rv = ROW_COUNT;
  RETURN rv;
END;
$$;
COMMENT ON FUNCTION public.cleanup_webauthn_challenges() IS 'Deletes webauthn_challenges older than 5 minutes. Call from pg_cron or Edge Function.';
