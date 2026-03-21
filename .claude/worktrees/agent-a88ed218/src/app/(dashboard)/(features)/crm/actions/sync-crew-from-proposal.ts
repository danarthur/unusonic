'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import type { RunOfShowData } from '@/entities/event/api/get-event-summary';
import { getCrewRolesFromProposalForDeal, getCrewRolesFromProposalDiagnostic, type CrewRolesDiagnostic } from './get-crew-roles-from-proposal';

export type SyncCrewFromProposalResult =
  | { success: true; added: number; diagnostic?: CrewRolesDiagnostic }
  | { success: false; error: string };

/**
 * For an event that was handed over before we added proposal→crew linking:
 * finds the deal linked to this event, derives crew roles from that deal's
 * proposal (service packages with staff_role), and merges them into the
 * event's run_of_show_data so "DJ - requested" etc. appear on the Plan lens.
 */
export async function syncCrewFromProposalToEvent(eventId: string): Promise<SyncCrewFromProposalResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { success: false, error: 'No active workspace.' };
  }

  const supabase = await createClient();

  const { data: event, error: eventErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, run_of_show_data, project:projects!inner(workspace_id)')
    .eq('id', eventId)
    .eq('projects.workspace_id', workspaceId)
    .maybeSingle();

  if (eventErr || !event) {
    return { success: false, error: 'Event not found.' };
  }

  const { data: deal } = await supabase
    .from('deals')
    .select('id')
    .eq('event_id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (!deal?.id) {
    return { success: false, error: 'No deal linked to this event. Crew from proposal is set when you hand over a deal.' };
  }

  const proposalRoles = await getCrewRolesFromProposalForDeal(deal.id);
  if (proposalRoles.length === 0) {
    const diagnostic = await getCrewRolesFromProposalDiagnostic(deal.id);
    return { success: true, added: 0, diagnostic };
  }

  const current = (event as { run_of_show_data: RunOfShowData | null }).run_of_show_data ?? {};
  const existingItems = current.crew_items ?? [];
  const existingRoles = new Set(existingItems.map((c) => c.role));
  const newItems = proposalRoles
    .filter((role) => !existingRoles.has(role))
    .map((role) => ({ role, status: 'requested' as const }));
  const added = newItems.length;
  if (added === 0) {
    const diagnostic = await getCrewRolesFromProposalDiagnostic(deal.id);
    return { success: true, added: 0, diagnostic };
  }

  const merged: RunOfShowData = {
    ...current,
    crew_roles: [...new Set([...(current.crew_roles ?? []), ...proposalRoles])],
    crew_items: [...existingItems, ...newItems],
  };

  const { error: updateErr } = await supabase
    .schema('ops')
    .from('events')
    .update({ run_of_show_data: merged as Record<string, unknown> })
    .eq('id', eventId);

  if (updateErr) {
    console.error('[CRM] syncCrewFromProposalToEvent:', updateErr.message);
    return { success: false, error: updateErr.message };
  }

  return { success: true, added };
}
