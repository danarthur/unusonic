-- Allow auth user delete to succeed: events.pm_id and events.producer_id
-- reference public.profiles(id). Without ON DELETE, deleting the user
-- (cascade to profile) fails. Set ON DELETE SET NULL so events keep rows
-- but pm_id/producer_id are cleared when the profile is removed.
-- Run once in Supabase Dashboard → SQL Editor if not applied via db push.

ALTER TABLE public.events
  DROP CONSTRAINT IF EXISTS events_pm_id_fkey,
  DROP CONSTRAINT IF EXISTS events_producer_id_fkey;

ALTER TABLE public.events
  ADD CONSTRAINT events_pm_id_fkey
    FOREIGN KEY (pm_id) REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD CONSTRAINT events_producer_id_fkey
    FOREIGN KEY (producer_id) REFERENCES public.profiles(id) ON DELETE SET NULL;
