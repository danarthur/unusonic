-- The passkey nudge banner could not be dismissed.
--
-- `getPasskeyNudgeState` reads `profiles.passkey_nudge_dismissed_at` and
-- `dismissPasskeyNudge` writes it. The column does not exist, so the read
-- answered 400 (banner shows) and the write answered 400 (dismissal is not
-- recorded) -- the banner came back on every page load, for everyone, forever.
--
-- Adding the column is the smaller and more honest of the two fixes. The other
-- would be to keep the dismissal in the browser, which makes it per-device: a
-- nudge to set up a passkey is exactly the thing someone dismisses on their
-- laptop and then meets again on their phone.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS passkey_nudge_dismissed_at timestamptz;

COMMENT ON COLUMN public.profiles.passkey_nudge_dismissed_at IS
  'When the user dismissed the passkey setup nudge. NULL = never dismissed.';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'profiles'
      AND column_name = 'passkey_nudge_dismissed_at'
  ) THEN
    RAISE EXCEPTION 'profiles.passkey_nudge_dismissed_at was not added';
  END IF;
END $$;
