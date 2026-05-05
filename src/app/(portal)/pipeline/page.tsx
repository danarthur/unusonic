/**
 * Pipeline — salesperson portal.
 * Shows deals owned by the salesperson, grouped by their workspace's default
 * pipeline stages. Honors `hide_from_portal` (admin-controlled visibility) and
 * drops `kind='lost'` stages from the main view.
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { resolvePortalProfile } from '@/shared/lib/portal-profiles';
import { getWorkspacePipelineStages } from '@/app/(dashboard)/(features)/productions/actions/get-workspace-pipeline-stages';
import { PipelineView } from './pipeline-view';

export const dynamic = 'force-dynamic';

async function loadContactNames(
  supabase: Awaited<ReturnType<typeof createClient>>,
  contactIds: string[],
): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  if (contactIds.length === 0) return map;
  const { data: contacts } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name')
    .in('id', contactIds);
  for (const c of contacts ?? []) {
    map.set(c.id, c.display_name ?? 'Unknown');
  }
  return map;
}

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

  // Fetch workspace default pipeline + deals in parallel
  const [pipeline, dealsResult] = await Promise.all([
    getWorkspacePipelineStages(),
    supabase
      .from('deals')
      .select(`
        id, title, status, stage_id, proposed_date, budget_estimated, event_archetype,
        venue_name, lead_source, won_at, lost_at, created_at,
        owner_entity_id, organization_id, main_contact_id
      `)
      .eq('owner_entity_id', personEntity.id)
      .is('archived_at', null)
      .order('created_at', { ascending: false })
      .limit(100),
  ]);

  const deals = dealsResult.data;

  // Fetch client names for deals
  const contactIds = [
    ...new Set(
      (deals ?? []).map((d: { main_contact_id: string | null }) => d.main_contact_id).filter((id): id is string => Boolean(id)),
    ),
  ];
  const clientMap = await loadContactNames(supabase, contactIds);

  type DealRow = {
    id: string;
    title: string | null;
    status: string;
    stage_id: string | null;
    proposed_date: string | null;
    budget_estimated: number | string | null;
    event_archetype: string | null;
    venue_name: string | null;
    lead_source: string | null;
    won_at: string | null;
    lost_at: string | null;
    created_at: string;
    main_contact_id: string | null;
  };

  const enrichedDeals = ((deals ?? []) as DealRow[]).map((d) => ({
    id: d.id,
    title: d.title,
    status: d.status,
    stageId: d.stage_id,
    proposedDate: d.proposed_date,
    budgetEstimated: d.budget_estimated !== null && d.budget_estimated !== undefined ? Number(d.budget_estimated) : null,
    eventArchetype: d.event_archetype,
    venueName: d.venue_name,
    clientName: d.main_contact_id ? clientMap.get(d.main_contact_id) ?? null : null,
    leadSource: d.lead_source,
    wonAt: d.won_at,
    lostAt: d.lost_at,
    createdAt: d.created_at,
  }));

  return (
    <PipelineView deals={enrichedDeals} stages={pipeline?.stages ?? []} />
  );
}
