'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { syncCrewFromProposal } from './deal-crew';
import { getCrewRolesFromProposalDiagnostic, type CrewRolesDiagnostic } from './get-crew-roles-from-proposal';

export type SyncCrewFromProposalResult =
  | { success: true; added: number; diagnostic?: CrewRolesDiagnostic }
  | { success: false; error: string };

/**
 * "Sync from proposal" action for an event-level surface (CrewFlightCheck).
 *
 * Delegates to the canonical `syncCrewFromProposal(dealId)` which writes to
 * `ops.deal_crew` — the source of truth. The legacy JSONB path
 * (`run_of_show_data.crew_items`) has been removed; it conflicted with live
 * dispatch state and kept the Plan tab out of sync with proposal assignees.
 */
export async function syncCrewFromProposalToEvent(eventId: string): Promise<SyncCrewFromProposalResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { success: false, error: 'No active workspace.' };
  }

  const supabase = await createClient();

  // Verify the event belongs to this workspace (RLS fallback scope check).
  const { data: event, error: eventErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, project:projects!inner(workspace_id)')
    .eq('id', eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();

  if (eventErr || !event) {
    return { success: false, error: 'Event not found.' };
  }

  // Resolve the deal linked to this event.
  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!deal?.id) {
    return { success: false, error: 'No deal linked to this event. Crew from proposal is set when you hand over a deal.' };
  }

  const dealId = (deal as { id: string }).id;

  // Count deal_crew rows before/after to compute `added` for the UI pill.
  const { count: beforeCount } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId);

  await syncCrewFromProposal(dealId);

  const { count: afterCount } = await supabase
    .schema('ops')
    .from('deal_crew')
    .select('id', { count: 'exact', head: true })
    .eq('deal_id', dealId);

  const added = Math.max(0, (afterCount ?? 0) - (beforeCount ?? 0));

  if (added === 0) {
    const diagnostic = await getCrewRolesFromProposalDiagnostic(dealId);
    return { success: true, added: 0, diagnostic };
  }

  return { success: true, added };
}
