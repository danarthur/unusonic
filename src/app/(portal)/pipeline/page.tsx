/**
 * Pipeline — salesperson portal.
 * Shows deals owned by the salesperson, grouped by status.
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { resolvePortalProfile } from '@/shared/lib/portal-profiles';
import { PipelineView } from './pipeline-view';

export const dynamic = 'force-dynamic';

export default async function PipelinePage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve person entity
  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) notFound();

  // Verify this user has a salesperson profile
  const { data: caps } = await supabase
    .schema('ops')
    .from('entity_capabilities')
    .select('capability')
    .eq('entity_id', personEntity.id);

  const { data: skills } = await supabase
    .schema('ops')
    .from('crew_skills')
    .select('skill_tag')
    .eq('entity_id', personEntity.id);

  const resolved = resolvePortalProfile({
    capabilities: (caps ?? []).map(c => c.capability),
    skillTags: (skills ?? []).map(s => s.skill_tag),
  });

  if (resolved.primary.key !== 'salesperson' && !resolved.all.some(p => p.key === 'salesperson')) {
    notFound();
  }

  // Fetch deals owned by this entity
  const { data: deals } = await supabase
    .from('deals')
    .select(`
      id, title, status, proposed_date, budget_estimated, event_archetype,
      venue_name, lead_source, won_at, lost_at, created_at,
      owner_entity_id, organization_id, main_contact_id
    `)
    .eq('owner_entity_id', personEntity.id)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(100);

  // Fetch client names for deals
  const orgIds = [...new Set((deals ?? []).map(d => d.organization_id).filter(Boolean))];
  const clientMap = new Map<string, string>();

  // Get client entity names from main_contact_id
  const contactIds = [...new Set((deals ?? []).map((d: any) => d.main_contact_id).filter(Boolean))];
  if (contactIds.length > 0) {
    const { data: contacts } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name')
      .in('id', contactIds);

    for (const c of contacts ?? []) {
      clientMap.set(c.id, c.display_name ?? 'Unknown');
    }
  }

  const enrichedDeals = (deals ?? []).map((d: any) => ({
    id: d.id as string,
    title: d.title as string | null,
    status: d.status as string,
    proposedDate: d.proposed_date as string | null,
    budgetEstimated: d.budget_estimated ? Number(d.budget_estimated) : null,
    eventArchetype: d.event_archetype as string | null,
    venueName: d.venue_name as string | null,
    clientName: d.main_contact_id ? clientMap.get(d.main_contact_id) ?? null : null,
    leadSource: d.lead_source as string | null,
    wonAt: d.won_at as string | null,
    lostAt: d.lost_at as string | null,
    createdAt: d.created_at as string,
  }));

  return (
    <PipelineView deals={enrichedDeals} />
  );
}
