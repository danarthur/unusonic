-- Phase 1: Intelligent Intake — Deals table
-- Intake/inquiries live here. Events table = Job Schedule (only after deal is signed).
-- proposed_date + event_archetype support feasibility check and calendar shadow overlay.
-- ARCHIVED: Already applied via MCP; re-running causes "policy already exists" error.

CREATE TABLE IF NOT EXISTS public.deals (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  proposed_date date NOT NULL,
  event_archetype text CHECK (event_archetype IS NULL OR event_archetype IN ('wedding', 'corporate_gala', 'product_launch', 'private_dinner')),
  title text,
  organization_id uuid,
  main_contact_id uuid,
  status text NOT NULL DEFAULT 'inquiry' CHECK (status IN ('inquiry', 'proposal', 'contract_sent', 'won', 'lost')),
  budget_estimated numeric,
  notes text,
  venue_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  event_id uuid REFERENCES public.events(id) ON DELETE SET NULL
);

COMMENT ON TABLE public.deals IS 'Intake/inquiries. Event row created only when deal is signed (Phase 2).';
COMMENT ON COLUMN public.deals.proposed_date IS 'Date the client is inquiring about; used for feasibility and calendar shadow.';
COMMENT ON COLUMN public.deals.event_archetype IS 'Wedding, Corporate Gala, Product Launch, Private Dinner.';
COMMENT ON COLUMN public.deals.event_id IS 'Set when deal is won (Phase 2); links to created Event.';

CREATE INDEX IF NOT EXISTS deals_workspace_id_idx ON public.deals(workspace_id);
CREATE INDEX IF NOT EXISTS deals_proposed_date_idx ON public.deals(proposed_date);
CREATE INDEX IF NOT EXISTS deals_status_idx ON public.deals(status);

ALTER TABLE public.deals ENABLE ROW LEVEL SECURITY;

CREATE POLICY deals_workspace_select ON public.deals
  FOR SELECT USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY deals_workspace_insert ON public.deals
  FOR INSERT WITH CHECK (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY deals_workspace_update ON public.deals
  FOR UPDATE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );

CREATE POLICY deals_workspace_delete ON public.deals
  FOR DELETE USING (
    workspace_id IN (
      SELECT workspace_id FROM public.workspace_members WHERE user_id = auth.uid()
    )
  );
