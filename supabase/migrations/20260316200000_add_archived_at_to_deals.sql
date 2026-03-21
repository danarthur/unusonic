ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS archived_at timestamptz;
