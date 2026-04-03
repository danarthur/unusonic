'use server';
 

import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { syncGearFromProposalToEvent } from './sync-gear-from-proposal';
import { seedAdvancingChecklist } from './advancing-checklist';

export type HandoverResult =
  | { success: true; eventId: string }
  | { success: false; error: string };

/** Vitals from the handoff wizard: date/time, venue, client. */
export type HandoverVitals = {
  start_at: string;
  end_at: string;
  venue_entity_id?: string | null;
  /** Set on ops.projects.client_entity_id for the project used by the new event. */
  client_entity_id?: string | null;
};

/** Gear/logistics data saved into ops.events.run_of_show_data (crew managed via deal_crew table). */
export type HandoverRunOfShowData = {
  gear_requirements?: string | null;
  venue_restrictions?: string | null;
  [key: string]: unknown;
};

/** Optional payload from the multi-step handoff wizard. When omitted, behavior is legacy: name + date from deal only. */
export type HandoverPayload = {
  /** Event name (defaults to deal title when not provided). */
  name?: string | null;
  vitals: HandoverVitals;
  run_of_show_data?: HandoverRunOfShowData | null;
};

/**
 * Hand over a deal to production: marks as won, creates an ops.events row, and links deal.event_id.
 * Requires a project for the workspace (ops.projects); uses first project if multiple.
 * When payload is provided (from the handoff wizard), vitals and run_of_show_data are written to the event and project.
 */
export async function handoverDeal(
  dealId: string,
  payload?: HandoverPayload | null
): Promise<HandoverResult> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) {
    return { success: false, error: 'No active workspace.' };
  }

  const supabase = await createClient();

  const { data: deal, error: dealErr } = await supabase
    .from('deals')
    .select('id, title, status, proposed_date, workspace_id, event_id, event_start_time, event_end_time')
    .eq('id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (dealErr || !deal) {
    return { success: false, error: 'Deal not found.' };
  }

  const r = deal as Record<string, unknown>;
  if (r.event_id) {
    return { success: true, eventId: r.event_id as string };
  }

  // Guard: check for orphaned event (event created but deal.event_id not set due to prior failure)
  const { data: existingEvent } = await supabase
    .schema('ops')
    .from('events')
    .select('id')
    .eq('deal_id', dealId)
    .limit(1)
    .maybeSingle();

  if (existingEvent) {
    // Fix the orphan: link the existing event to the deal
    const eid = (existingEvent as { id: string }).id;
    await supabase
      .from('deals')
      .update({ status: 'won', event_id: eid, won_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq('id', dealId)
      .eq('workspace_id', workspaceId);
    revalidatePath('/crm');
    return { success: true, eventId: eid };
  }

  const status = (r.status as string) ?? '';
  if (!['contract_signed', 'deposit_received'].includes(status as string)) {
    return { success: false, error: 'Contract must be signed before handover.' };
  }

  const { data: projects, error: projErr } = await supabase
    .schema('ops')
    .from('projects')
    .select('id')
    .eq('workspace_id', workspaceId)
    .limit(1);

  if (projErr) {
    return { success: false, error: projErr.message };
  }

  let projectId: string;

  if (projects?.length) {
    projectId = (projects[0] as { id: string }).id;
  } else {
    // No project for workspace: create a default so the user can build proposals without a manual "add project" step
    const { data: inserted, error: insertErr } = await supabase
      .schema('ops')
      .from('projects')
      .insert({
        workspace_id: workspaceId,
        name: 'Production',
        status: 'lead',
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      return { success: false, error: insertErr?.message ?? 'Could not create project for workspace.' };
    }
    projectId = (inserted as { id: string }).id;
  }

  const title = (r.title as string)?.trim() || 'Untitled Production';
  const proposedDate = r.proposed_date ? String(r.proposed_date) : new Date().toISOString().slice(0, 10);

  let startAt: string;
  let endAt: string;
  let eventName: string;
  let venueEntityId: string | null = null;
  let runOfShowData: HandoverRunOfShowData | null = null;
  let clientEntityId: string | null = null;

  if (payload?.vitals) {
    startAt = payload.vitals.start_at;
    endAt = payload.vitals.end_at;
    venueEntityId = payload.vitals.venue_entity_id ?? null;
    clientEntityId = payload.vitals.client_entity_id ?? null;
    eventName = (payload.name ?? title).trim() || title;
    runOfShowData = payload.run_of_show_data ?? null;
  } else {
    const dealStartTime = (r.event_start_time as string) ?? null;
    const dealEndTime = (r.event_end_time as string) ?? null;
    startAt = dealStartTime ? `${proposedDate}T${dealStartTime}:00` : `${proposedDate}T08:00:00.000Z`;
    endAt = dealEndTime ? `${proposedDate}T${dealEndTime}:00` : `${proposedDate}T18:00:00.000Z`;
    eventName = title;
  }

  // Crew is managed via deal_crew table — Plan tab reads from it directly.
  // No need to copy crew into run_of_show_data JSONB during handoff.
  // Strip any wizard-supplied crew_items/crew_roles from runOfShowData to avoid stale JSONB.
  if (runOfShowData) {
    const { crew_items: _ci, crew_roles: _cr, ...nonCrewData } = runOfShowData;
    runOfShowData = nonCrewData;
  }

  const { data: event, error: eventErr } = await supabase
    .schema('ops')
    .from('events')
    .insert({
      project_id: projectId,
      workspace_id: workspaceId,
      deal_id: dealId,
      title: eventName,
      starts_at: startAt,
      ends_at: endAt,
      venue_entity_id: venueEntityId,
      client_entity_id: clientEntityId,
      run_of_show_data: runOfShowData,
    })
    .select('id')
    .single();

  if (eventErr) {
    console.error('[CRM] handoverDeal insert event:', eventErr.message);
    return { success: false, error: eventErr.message };
  }

  const eventId = (event as { id: string }).id;

  if (clientEntityId) {
    await supabase
      .schema('ops')
      .from('projects')
      .update({ client_entity_id: clientEntityId })
      .eq('id', projectId);
  }

  // C1: Auto-map proposal gear → event gear items (fire-and-forget, non-blocking)
  syncGearFromProposalToEvent(eventId).catch((err) =>
    console.error('[CRM] handoverDeal gear sync:', err)
  );

  // Seed advancing checklist with archetype template
  const archetype = (deal as Record<string, unknown>).event_archetype as string | null;
  seedAdvancingChecklist(eventId, archetype).catch((err) =>
    console.error('[CRM] handoverDeal checklist seed:', err)
  );

  const { error: updateErr } = await supabase
    .from('deals')
    .update({ status: 'won', event_id: eventId, won_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', dealId)
    .eq('workspace_id', workspaceId);

  if (updateErr) {
    console.error('[CRM] handoverDeal update deal:', updateErr.message);
    return { success: false, error: updateErr.message };
  }

  // Create contract from accepted proposal (client signed during Liquid phase; event didn't exist yet)
  const { data: acceptedProposal } = await supabase
    .from('proposals')
    .select('id, signed_at')
    .eq('deal_id', dealId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (acceptedProposal?.id) {
    const signedAt = (acceptedProposal as { signed_at?: string | null }).signed_at ?? new Date().toISOString();
    await supabase.from('contracts').insert({
      workspace_id: workspaceId,
      event_id: eventId,
      status: 'signed',
      signed_at: signedAt,
      pdf_url: null,
    });
  }

  revalidatePath('/crm');
  revalidatePath('/');
  revalidatePath('/network');
  return { success: true, eventId };
}
