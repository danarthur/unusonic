-- Add passkey nudge tracking to profiles and friendly names to passkeys
-- Part of the passkey experience improvement (docs/research/passkey-experience-plan.md)

-- 1. Passkey nudge: tracks when user last dismissed the "add a passkey" prompt
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS passkey_nudge_dismissed_at timestamptz;

COMMENT ON COLUMN public.profiles.passkey_nudge_dismissed_at IS
  'When the user last dismissed the post-login passkey enrollment nudge. NULL = never dismissed.';

-- 2. Friendly name: user-editable label for each passkey ("MacBook Pro", "iPhone 15")
ALTER TABLE public.passkeys
  ADD COLUMN IF NOT EXISTS friendly_name text;

COMMENT ON COLUMN public.passkeys.friendly_name IS
  'User-editable label for this passkey (e.g. "MacBook Pro", "iPhone 15"). Set at registration, editable in settings.';
