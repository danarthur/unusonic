'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { Json } from '@/types/supabase';

export type LeadSource = 'referral' | 'repeat_client' | 'website' | 'social' | 'direct';
export type LostReason = 'budget' | 'competitor' | 'cancelled' | 'no_response' | 'scope' | 'timing';

export type DealDetail = {
  id: string;
  workspace_id: string;
  title: string | null;
  status: string;
  created_at: string;
  proposed_date: string | null;
  event_archetype: string | null;
  notes: string | null;
  budget_estimated: number | null;
  event_id: string | null;
  organization_id: string | null;
  main_contact_id: string | null;
  venue_id: string | null;
  preferred_crew: Json | null;
  owner_user_id: string | null;
  owner_entity_id: string | null;
  lead_source: LeadSource | null;
  lead_source_id: string | null;
  lead_source_detail: string | null;
  referrer_entity_id: string | null;
  lost_reason: LostReason | null;
  lost_to_competitor_name: string | null;
  won_at: string | null;
  lost_at: string | null;
};

export async function getDeal(dealId: string): Promise<DealDetail | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deals')
    .select('id, workspace_id, title, status, created_at, proposed_date, event_archetype, notes, budget_estimated, event_id, organization_id, main_contact_id, venue_id, preferred_crew, owner_user_id, owner_entity_id, lead_source, lead_source_id, lead_source_detail, referrer_entity_id, lost_reason, lost_to_competitor_name, won_at, lost_at')
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
    created_at: (r.created_at as string) ?? new Date().toISOString(),
    proposed_date: r.proposed_date ? String(r.proposed_date) : null,
    event_archetype: (r.event_archetype as string) ?? null,
    notes: (r.notes as string) ?? null,
    budget_estimated: r.budget_estimated != null ? Number(r.budget_estimated) : null,
    event_id: (r.event_id as string) ?? null,
    organization_id: (r.organization_id as string) ?? null,
    main_contact_id: (r.main_contact_id as string) ?? null,
    venue_id: (r.venue_id as string) ?? null,
    preferred_crew: (r.preferred_crew as Json) ?? null,
    owner_user_id: (r.owner_user_id as string) ?? null,
    owner_entity_id: (r.owner_entity_id as string) ?? null,
    lead_source: (r.lead_source as LeadSource) ?? null,
    lead_source_id: (r.lead_source_id as string) ?? null,
    lead_source_detail: (r.lead_source_detail as string) ?? null,
    referrer_entity_id: (r.referrer_entity_id as string) ?? null,
    lost_reason: (r.lost_reason as LostReason) ?? null,
    lost_to_competitor_name: (r.lost_to_competitor_name as string) ?? null,
    won_at: (r.won_at as string) ?? null,
    lost_at: (r.lost_at as string) ?? null,
  };
}

/** Returns the deal linked to this event (deal.event_id = eventId), if any. Used when viewing an event in Prism to show contract/signed proposal on the Deal tab. */
export async function getDealByEventId(eventId: string): Promise<DealDetail | null> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();
  const { data, error } = await supabase
    .from('deals')
    .select('id, workspace_id, title, status, created_at, proposed_date, event_archetype, notes, budget_estimated, event_id, organization_id, main_contact_id, venue_id, preferred_crew, owner_user_id, owner_entity_id, lead_source, lead_source_id, lead_source_detail, referrer_entity_id, lost_reason, lost_to_competitor_name, won_at, lost_at')
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
    created_at: (r.created_at as string) ?? new Date().toISOString(),
    proposed_date: r.proposed_date ? String(r.proposed_date) : null,
    event_archetype: (r.event_archetype as string) ?? null,
    notes: (r.notes as string) ?? null,
    budget_estimated: r.budget_estimated != null ? Number(r.budget_estimated) : null,
    event_id: (r.event_id as string) ?? null,
    organization_id: (r.organization_id as string) ?? null,
    main_contact_id: (r.main_contact_id as string) ?? null,
    venue_id: (r.venue_id as string) ?? null,
    preferred_crew: (r.preferred_crew as Json) ?? null,
    owner_user_id: (r.owner_user_id as string) ?? null,
    owner_entity_id: (r.owner_entity_id as string) ?? null,
    lead_source: (r.lead_source as LeadSource) ?? null,
    lead_source_id: (r.lead_source_id as string) ?? null,
    lead_source_detail: (r.lead_source_detail as string) ?? null,
    referrer_entity_id: (r.referrer_entity_id as string) ?? null,
    lost_reason: (r.lost_reason as LostReason) ?? null,
    lost_to_competitor_name: (r.lost_to_competitor_name as string) ?? null,
    won_at: (r.won_at as string) ?? null,
    lost_at: (r.lost_at as string) ?? null,
  };
}
