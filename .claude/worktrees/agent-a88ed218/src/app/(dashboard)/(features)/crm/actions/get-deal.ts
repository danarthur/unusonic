'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type DealDetail = {
  id: string;
  workspace_id: string;
  title: string | null;
  status: string;
  proposed_date: string | null;
  event_archetype: string | null;
  notes: string | null;
  budget_estimated: number | null;
  event_id: string | null;
  organization_id: string | null;
  main_contact_id: string | null;
  venue_id: string | null;
};

export async function getDeal(dealId: string): Promise<DealDetail | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deals')
    .select('id, workspace_id, title, status, proposed_date, event_archetype, notes, budget_estimated, event_id, organization_id, main_contact_id, venue_id')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    workspace_id: (r.workspace_id as string) ?? workspaceId,
    title: (r.title as string) ?? null,
    status: (r.status as string) ?? 'inquiry',
    proposed_date: r.proposed_date ? String(r.proposed_date) : null,
    event_archetype: (r.event_archetype as string) ?? null,
    notes: (r.notes as string) ?? null,
    budget_estimated: r.budget_estimated != null ? Number(r.budget_estimated) : null,
    event_id: (r.event_id as string) ?? null,
    organization_id: (r.organization_id as string) ?? null,
    main_contact_id: (r.main_contact_id as string) ?? null,
    venue_id: (r.venue_id as string) ?? null,
  };
}

/** Returns the deal linked to this event (deal.event_id = eventId), if any. Used when viewing an event in Prism to show contract/signed proposal on the Deal tab. */
export async function getDealByEventId(eventId: string): Promise<DealDetail | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deals')
    .select('id, workspace_id, title, status, proposed_date, event_archetype, notes, budget_estimated, event_id, organization_id, main_contact_id, venue_id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error || !data) return null;
  const r = data as Record<string, unknown>;
  return {
    id: r.id as string,
    workspace_id: (r.workspace_id as string) ?? workspaceId,
    title: (r.title as string) ?? null,
    status: (r.status as string) ?? 'inquiry',
    proposed_date: r.proposed_date ? String(r.proposed_date) : null,
    event_archetype: (r.event_archetype as string) ?? null,
    notes: (r.notes as string) ?? null,
    budget_estimated: r.budget_estimated != null ? Number(r.budget_estimated) : null,
    event_id: (r.event_id as string) ?? null,
    organization_id: (r.organization_id as string) ?? null,
    main_contact_id: (r.main_contact_id as string) ?? null,
    venue_id: (r.venue_id as string) ?? null,
  };
}
