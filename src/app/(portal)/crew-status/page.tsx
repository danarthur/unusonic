/**
 * Crew Status — Production Manager portal dashboard.
 * Shows all upcoming events for the workspace with full crew rosters
 * and confirmation status. Profile-gated to production_manager only.
 */

import { notFound } from 'next/navigation';
import { createClient } from '@/shared/api/supabase/server';
import { resolvePortalProfile } from '@/shared/lib/portal-profiles';
import { getWorkspaceCrewStatus } from '@/features/ops/actions/get-workspace-crew-status';
import { CrewStatusView } from './crew-status-view';

export const dynamic = 'force-dynamic';

export default async function CrewStatusPage() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;

  // Resolve the user's person entity
  const { data: personEntity } = await supabase
    .schema('directory')
    .from('entities')
    .select('id')
    .eq('claimed_by_user_id', user.id)
    .eq('type', 'person')
    .maybeSingle();

  if (!personEntity) return notFound();

  // Get workspace membership
  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  if (!membership) return notFound();
  const workspaceId = membership.workspace_id as string;

  // Resolve portal profile — check for admin override via ROSTER_MEMBER edge
  const { data: rosterEdge } = await supabase
    .schema('cortex')
    .from('relationships')
    .select('context_data')
    .eq('target_entity_id', personEntity.id)
    .eq('relationship_type', 'ROSTER_MEMBER')
    .maybeSingle();

  const adminOverride = (rosterEdge?.context_data as Record<string, unknown> | null)
    ?.primary_portal_profile as string | null ?? null;

  // Get capabilities and skills for profile resolution
  const [capResult, skillResult] = await Promise.all([
    supabase
      .schema('ops')
      .from('entity_capabilities')
      .select('capability')
      .eq('entity_id', personEntity.id)
      .eq('workspace_id', workspaceId),
    supabase
      .schema('ops')
      .from('crew_skills')
      .select('skill_tag')
      .eq('entity_id', personEntity.id),
  ]);

  const capabilities = ((capResult.data ?? []) as Array<{ capability: string }>)
    .map((c) => c.capability);
  const skillTags = ((skillResult.data ?? []) as Array<{ skill_tag: string }>)
    .map((s) => s.skill_tag);

  const { primary } = resolvePortalProfile({ capabilities, skillTags, adminOverride });

  // Gate: only production_manager profile can access this page
  if (primary.key !== 'production_manager') {
    return notFound();
  }

  // Fetch crew status for all upcoming events in the workspace
  const events = await getWorkspaceCrewStatus(workspaceId);

  return (
    <>
      <div className="flex items-center gap-2">
        <h1 className="text-lg font-semibold tracking-tight text-[var(--stage-text-primary)]">
          Crew status
        </h1>
      </div>
      <CrewStatusView events={events} />
    </>
  );
}
