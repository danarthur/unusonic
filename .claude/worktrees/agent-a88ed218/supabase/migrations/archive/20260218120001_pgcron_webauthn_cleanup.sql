-- Enable pg_cron and schedule webauthn_challenges cleanup (every 5 minutes).
-- Jobs run in postgres and have access to public schema.
CREATE EXTENSION IF NOT EXISTS pg_cron;

SELECT cron.schedule(
  'cleanup-webauthn-challenges',
  '*/5 * * * *',
  $$ DELETE FROM public.webauthn_challenges WHERE created_at < now() - interval '5 minutes' $$
);
