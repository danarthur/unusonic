-- Bridge companion app tables.
-- These live in `public` because they operate at the pre-auth boundary
-- (device token auth, not Supabase session auth).

-- 1. BRIDGE DEVICE TOKENS
-- Long-lived tokens issued to paired Bridge companion apps.
CREATE TABLE public.bridge_device_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_entity_id uuid NOT NULL,
  device_name text NOT NULL DEFAULT 'Unknown device',
  token_hash text UNIQUE NOT NULL,  -- SHA-256 of the JWT for revocation lookup
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now(),
  revoked_at timestamptz
);

CREATE INDEX idx_bridge_device_tokens_user ON public.bridge_device_tokens(user_id);
CREATE INDEX idx_bridge_device_tokens_hash ON public.bridge_device_tokens(token_hash);

-- RLS: users can see and manage their own device tokens
ALTER TABLE public.bridge_device_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY bridge_tokens_select ON public.bridge_device_tokens
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY bridge_tokens_delete ON public.bridge_device_tokens
  FOR DELETE USING (user_id = auth.uid());

-- INSERT/UPDATE via server only (pairing flow uses system client)


-- 2. BRIDGE PAIRING CODES
-- Short-lived codes displayed in the portal for the DJ to type into Bridge.
CREATE TABLE public.bridge_pairing_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  person_entity_id uuid NOT NULL,
  code text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE INDEX idx_bridge_pairing_codes_code ON public.bridge_pairing_codes(code);

-- RLS: users can see their own codes (to display in portal)
ALTER TABLE public.bridge_pairing_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY bridge_codes_select ON public.bridge_pairing_codes
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY bridge_codes_insert ON public.bridge_pairing_codes
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- Consumption happens via system client (Bridge API route)


-- 3. BRIDGE SYNC STATUS
-- Per-event sync reports from Bridge companion apps.
CREATE TABLE public.bridge_sync_status (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  device_token_id uuid NOT NULL REFERENCES public.bridge_device_tokens(id) ON DELETE CASCADE,
  event_id uuid NOT NULL,
  matched_count integer NOT NULL DEFAULT 0,
  total_count integer NOT NULL DEFAULT 0,
  unmatched_songs jsonb NOT NULL DEFAULT '[]'::jsonb,
  bridge_version text,
  synced_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_bridge_sync_status_event ON public.bridge_sync_status(event_id);
CREATE INDEX idx_bridge_sync_status_device ON public.bridge_sync_status(device_token_id);

-- Keep only the latest sync per device+event (upsert pattern in app code)
CREATE UNIQUE INDEX idx_bridge_sync_status_unique
  ON public.bridge_sync_status(device_token_id, event_id);

ALTER TABLE public.bridge_sync_status ENABLE ROW LEVEL SECURITY;

-- Users can read sync status for their own devices
CREATE POLICY bridge_sync_select ON public.bridge_sync_status
  FOR SELECT USING (
    device_token_id IN (
      SELECT id FROM public.bridge_device_tokens WHERE user_id = auth.uid()
    )
  );

-- INSERT/UPDATE via system client only (Bridge API route)


-- 4. HELPER: Generate a 6-character alphanumeric pairing code
CREATE OR REPLACE FUNCTION public.generate_bridge_pairing_code(
  p_user_id uuid,
  p_person_entity_id uuid
) RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_code text;
BEGIN
  -- Invalidate any existing unused codes for this user
  UPDATE public.bridge_pairing_codes
  SET expires_at = now()
  WHERE user_id = p_user_id
    AND consumed_at IS NULL
    AND expires_at > now();

  -- Generate a 6-char uppercase alphanumeric code
  v_code := upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 6));

  INSERT INTO public.bridge_pairing_codes (user_id, person_entity_id, code, expires_at)
  VALUES (p_user_id, p_person_entity_id, v_code, now() + interval '10 minutes');

  RETURN v_code;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_bridge_pairing_code(uuid, uuid) TO authenticated;
