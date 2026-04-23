ALTER TABLE public.proposal_items
  ADD COLUMN IF NOT EXISTS is_optional boolean NOT NULL DEFAULT false;

ALTER TABLE public.proposals
  ADD COLUMN IF NOT EXISTS client_selections_locked_at timestamptz;

CREATE TABLE IF NOT EXISTS public.proposal_client_selections (
  proposal_id  uuid NOT NULL REFERENCES public.proposals(id) ON DELETE CASCADE,
  item_id      uuid NOT NULL REFERENCES public.proposal_items(id) ON DELETE CASCADE,
  selected     boolean NOT NULL DEFAULT true,
  updated_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (proposal_id, item_id)
);

ALTER TABLE public.proposal_client_selections ENABLE ROW LEVEL SECURITY;

CREATE POLICY pcs_select ON public.proposal_client_selections
  FOR SELECT USING (
    proposal_id IN (
      SELECT id FROM public.proposals
      WHERE public_token IS NOT NULL
        AND status IN ('sent', 'viewed', 'accepted')
    )
  );
