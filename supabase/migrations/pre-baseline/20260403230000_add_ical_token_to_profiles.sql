-- Add ical_token column for per-user iCal feed URLs.
-- Token is generated on first access and stored permanently.
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ical_token text UNIQUE;
