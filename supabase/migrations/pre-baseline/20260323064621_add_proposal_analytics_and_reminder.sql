ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS first_viewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_viewed_at  timestamptz,
  ADD COLUMN IF NOT EXISTS view_count      integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS reminder_sent_at timestamptz;
