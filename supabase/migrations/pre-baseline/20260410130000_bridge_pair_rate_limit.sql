-- Bridge: per-IP rate limiting for POST /api/bridge/pair.
--
-- In-memory LRU doesn't work on Vercel serverless (every request can hit a
-- different cold instance), so we keep a thin table of pair attempts per IP
-- and check a sliding 1-hour window on each attempt. This is defense in depth;
-- the primary protection is the 5-minute pairing-code expiry plus ~40 bits of
-- Crockford base32 entropy. The limit is 10 attempts/hour/IP.
--
-- Note: per-code rate limiting is intentionally NOT implemented. Combined with
-- single-use consumption on success and 5-minute expiry, it would only add
-- value against a partial-knowledge shoulder-surf attack where the attacker
-- knows N chars of the code — and the per-IP limit already catches that.

CREATE TABLE IF NOT EXISTS public.bridge_pair_attempts (
  id           bigserial PRIMARY KEY,
  client_ip    inet        NOT NULL,
  attempted_at timestamptz NOT NULL DEFAULT now()
);

-- Composite index for the sliding-window count query.
CREATE INDEX IF NOT EXISTS bridge_pair_attempts_ip_time_idx
  ON public.bridge_pair_attempts (client_ip, attempted_at DESC);

-- No RLS — accessed only via SECURITY DEFINER function below.
ALTER TABLE public.bridge_pair_attempts ENABLE ROW LEVEL SECURITY;

-- Atomic check-and-record: returns true if under the limit (and inserts a
-- new attempt row), false if over. The insert is skipped when over limit so
-- sustained attacks don't grow the table unbounded.
CREATE OR REPLACE FUNCTION public.check_bridge_pair_rate_limit(
  p_client_ip inet
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int;
  v_limit constant int := 10;
BEGIN
  SELECT count(*) INTO v_count
  FROM public.bridge_pair_attempts
  WHERE client_ip = p_client_ip
    AND attempted_at > now() - interval '1 hour';

  IF v_count >= v_limit THEN
    RETURN false;
  END IF;

  INSERT INTO public.bridge_pair_attempts (client_ip) VALUES (p_client_ip);
  RETURN true;
END;
$$;

-- The Bridge pair endpoint calls this via the system client; no authenticated
-- user exists at that point. Grant to the service_role role only.
REVOKE ALL ON FUNCTION public.check_bridge_pair_rate_limit(inet) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.check_bridge_pair_rate_limit(inet) TO service_role;
