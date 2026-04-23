ALTER TABLE public.deals
  ADD COLUMN IF NOT EXISTS show_health jsonb DEFAULT NULL;

COMMENT ON COLUMN public.deals.show_health IS
  'PM health status: { status: on_track|at_risk|blocked, note: string, updated_at: ISO, updated_by_name: string }';
