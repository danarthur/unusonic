'use server';


import { createClient } from '@/shared/api/supabase/server';
import { revalidatePath } from 'next/cache';
import * as Sentry from '@sentry/nextjs';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { syncGearFromProposalToEvent } from './sync-gear-from-proposal';
import { seedAdvancingChecklist } from './advancing-checklist';
import { syncCrewRatesToAssignments } from './sync-crew-rates-to-assignments';
import { instrument } from '@/shared/lib/instrumentation';
import { resolveEventTimezone, toVenueInstant } from '@/shared/lib/timezone';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import { COUPLE_ATTR } from '@/entities/directory/model/attribute-keys';
import { publishDomainEvent } from '@/shared/lib/domain-events/publish-domain-event';
import { resolveStageByKind } from '@/shared/lib/pipeline-stages/resolve-stage';

export type HandoverResult =
  | { success: true; eventId: string; warnings?: string[] }
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
  return instrument('handoverDeal', async () => {
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

  // Phase 3i: look up the workspace's won stage once — used by both the orphan
  // recovery path and the main handover write below. Resolving by kind keeps
  // this rename-resilient.
  const wonStage = await resolveStageByKind(supabase, workspaceId, 'won');
  if (!wonStage) {
    return { success: false, error: 'Workspace has no won stage in its default pipeline.' };
  }

  if (existingEvent) {
    // Fix the orphan: link the existing event to the deal. Re-verify the
    // event belongs to this workspace before re-linking — deal_id alone
    // could theoretically collide across tenants without the guard.
    const eid = (existingEvent as { id: string }).id;
    const { data: eventWorkspaceCheck } = await supabase
      .schema('ops')
      .from('events')
      .select('id')
      .eq('id', eid)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    if (!eventWorkspaceCheck) {
      return { success: false, error: 'Orphan event belongs to a different workspace.' };
    }
    await supabase
      .from('deals')
      .update({
        stage_id: wonStage.stageId,
        event_id: eid,
        won_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('id', dealId)
      .eq('workspace_id', workspaceId);
    revalidatePath('/crm');
    revalidatePath('/events');
    revalidatePath(`/events/${eid}`, 'layout');
    return { success: true, eventId: eid };
  }

  // Phase 3i: gate accepts legacy slugs during the rollout window AND the
  // post-collapse kind ('won' covers contract_signed/deposit_received/won
  // after the BEFORE trigger derives). A deal still in a pre-signing stage
  // (status 'working' with a tagged stage other than the contract_signed
  // chain) would also land here — operators expect the wizard to guard
  // against that via UI gating anyway.
  const status = (r.status as string) ?? '';
  const validHandoverStates = new Set([
    // Post-collapse kinds:
    'won',
    // Legacy pre-collapse slugs still active during rollout:
    'contract_signed', 'deposit_received',
  ]);
  if (!validHandoverStates.has(status)) {
    return {
      success: false,
      error: 'Deal must have a signed contract, received deposit, or be marked won before handover.',
    };
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

  let startAt = '';
  let endAt = '';
  let eventName: string;
  let venueEntityId: string | null = null;
  let runOfShowData: HandoverRunOfShowData | null = null;
  let clientEntityId: string | null = null;

  if (payload?.vitals) {
    venueEntityId = payload.vitals.venue_entity_id ?? null;
    clientEntityId = payload.vitals.client_entity_id ?? null;
    startAt = payload.vitals.start_at;
    endAt = payload.vitals.end_at;
    eventName = (payload.name ?? title).trim() || title;
    runOfShowData = payload.run_of_show_data ?? null;

    // Defense-in-depth: the handoff wizard already guards fromLocalDatetime
    // against unparseable input, but this is the server contract and nothing
    // else validates before we write to ops.events.starts_at / ends_at.
    // Reject anything that doesn't parse to a finite Date so we never persist
    // "Invalid Date" ISOs.
    const startMs = Date.parse(startAt);
    const endMs = Date.parse(endAt);
    if (!startAt || Number.isNaN(startMs)) {
      return { success: false, error: 'Invalid start_at in handoff payload.' };
    }
    if (!endAt || Number.isNaN(endMs)) {
      return { success: false, error: 'Invalid end_at in handoff payload.' };
    }
    if (startMs >= endMs) {
      return { success: false, error: 'End time must be after start time.' };
    }
  } else {
    eventName = title;
  }

  // §3.2: resolve IANA timezone for the event record. Used for the ops.events.timezone
  // column AND (in the legacy path) to convert local times to proper UTC instants.
  // Resolution: venue attrs → workspace → 'UTC'. Before this fix, the legacy path
  // hardcoded T08:00:00.000Z, making "8am" mean 8:00 UTC regardless of venue location.
  // resolveEventTimezone reads the venue entity via venue_entity_id — new standard.
  const eventTimezone = await resolveEventTimezone({ venueId: venueEntityId, workspaceId });

  // Denormalize venue display_name onto ops.events.location_name so event detail
  // surfaces keep working if the venue entity is later soft-deleted / renamed.
  let locationName: string | null = null;
  if (venueEntityId) {
    const { data: venueEntity } = await supabase
      .schema('directory')
      .from('entities')
      .select('display_name')
      .eq('id', venueEntityId)
      .maybeSingle();
    locationName = (venueEntity as { display_name?: string | null } | null)?.display_name ?? null;
  }

  // Legacy path (no handoff wizard payload): convert deal's local times to UTC via venue tz
  if (!payload?.vitals) {
    startAt = toVenueInstant(proposedDate, (r.event_start_time as string) ?? '08:00', eventTimezone);
    endAt = toVenueInstant(proposedDate, (r.event_end_time as string) ?? '18:00', eventTimezone);
  }

  // Crew is managed via ops.deal_crew — Plan tab reads from it directly and the
  // handoff wizard no longer collects crew_roles, so runOfShowData passes through unchanged.

  // Pass 4 Phase 0.5 (rescan fix N1): set status + lifecycle_status explicitly on handoff.
  // Before this fix, lifecycle_status defaulted to NULL, which silently failed the
  // `.in('lifecycle_status', [...])` filters on Lobby widgets (use-lobby-events.ts:62),
  // dashboard urgency alerts (get-urgency-alerts.ts:76/305), CRM hooks (useCRM.ts:43),
  // and global search (search-global.ts:36). Every new event after handoff was invisible
  // on the Lobby and urgency surfaces until someone manually advanced the lifecycle.
  // The ('planned', 'production') pair is valid per ops.event_status_pair_valid (see
  // src/shared/lib/event-status/pair-valid.ts and the corresponding DB trigger).
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
      status: 'planned',
      lifecycle_status: 'production',
      timezone: eventTimezone,
      venue_entity_id: venueEntityId,
      client_entity_id: clientEntityId,
      location_name: locationName,
      event_archetype: (deal as Record<string, unknown>).event_archetype as string | null,
      run_of_show_data: runOfShowData,
    })
    .select('id')
    .single();

  if (eventErr) {
    Sentry.logger.error('crm.handoverDeal.insertEventFailed', {
      dealId,
      workspaceId,
      projectId,
      error: eventErr.message,
    });
    return { success: false, error: eventErr.message };
  }

  const eventId = (event as { id: string }).id;

  if (clientEntityId) {
    const { error: projectClientErr } = await supabase
      .schema('ops')
      .from('projects')
      .update({ client_entity_id: clientEntityId })
      .eq('id', projectId);
    if (projectClientErr) {
      // Non-fatal, but callers that filter ops.projects by client_entity_id
      // will be out of sync with ops.events until someone re-saves the deal.
      // Surface so the PM knows they may need to correct project-scoped
      // reporting later.
      Sentry.logger.error('crm.handoverDeal.projectClientEntityUpdateFailed', {
        dealId,
        eventId: (event as { id: string }).id,
        workspaceId,
        projectId,
        clientEntityId,
        error: projectClientErr.message,
      });
    }
  }

  // Post-handoff sync tasks — crew sync is awaited (critical for portal),
  // gear + checklist are fire-and-forget (non-critical enrichment)
  const archetype = (deal as Record<string, unknown>).event_archetype as string | null;

  // Fire the show.created domain event so downstream consumers (Follow-Up
  // Engine when it lands, audit-log readers today) see the handoff. Fire-and-
  // forget: publishDomainEvent swallows errors to Sentry so a publish failure
  // never rolls back the handoff itself.
  publishDomainEvent({
    workspaceId,
    eventId,
    type: 'show.created',
    payload: {
      eventId,
      dealId,
      clientEntityId,
      archetype,
      startsAt: startAt || null,
      endsAt: endAt || null,
    },
  }).catch((err) => {
    Sentry.logger.error('crm.handoverDeal.domainEventPublishFailed', {
      dealId,
      eventId,
      workspaceId,
      error: err instanceof Error ? err.message : String(err),
    });
  });
  const warnings: string[] = [];

  // Crew + gear sync are awaited so we can surface failures as warnings on the
  // HandoverResult — checklist + DJ prep stay fire-and-forget (Sentry-only).
  const [crewSyncResult, gearSyncResult] = await Promise.allSettled([
    syncCrewRatesToAssignments(eventId, dealId),
    syncGearFromProposalToEvent(eventId),
  ]);
  if (crewSyncResult.status === 'rejected') {
    const reason = crewSyncResult.reason instanceof Error
      ? crewSyncResult.reason.message
      : String(crewSyncResult.reason);
    Sentry.logger.error('crm.handoverDeal.crewSyncFailed', {
      dealId,
      eventId,
      workspaceId,
      error: reason,
    });
    warnings.push('Crew sync failed — you may need to re-add crew on the Plan tab.');
  } else if (crewSyncResult.value.emptySource) {
    // deal_crew had zero assigned rows — the Plan tab will show an empty
    // crew grid. Surface this as a warning so the PM knows they need to
    // add crew rather than thinking handoff "worked" with no roster.
    warnings.push(
      'No crew was assigned on the deal — add crew on the Plan tab before the show.',
    );
  }
  if (gearSyncResult.status === 'rejected') {
    const reason = gearSyncResult.reason instanceof Error
      ? gearSyncResult.reason.message
      : String(gearSyncResult.reason);
    Sentry.logger.error('crm.handoverDeal.gearSyncFailed', {
      dealId,
      eventId,
      workspaceId,
      error: reason,
    });
    warnings.push('Gear sync failed — flight check may be empty until you re-run gear sync.');
  }
  seedAdvancingChecklist(eventId, archetype).catch((err) => {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.logger.error('crm.handoverDeal.advancingChecklistSeedFailed', {
      dealId,
      eventId,
      workspaceId,
      archetype,
      error: message,
    });
  });
  // Seed DJ client info from client entity (couple names → dj_client_details)
  if (clientEntityId) {
    seedDjClientInfo(supabase, eventId, clientEntityId, archetype).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      Sentry.logger.error('crm.handoverDeal.djClientSeedFailed', {
        dealId,
        eventId,
        workspaceId,
        clientEntityId,
        archetype,
        error: message,
      });
    });
  }

  const { error: updateErr } = await supabase
    .from('deals')
    .update({
      stage_id: wonStage.stageId,
      event_id: eventId,
      won_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', dealId)
    .eq('workspace_id', workspaceId);

  if (updateErr) {
    Sentry.logger.error('crm.handoverDeal.updateDealFailed', {
      dealId,
      eventId,
      workspaceId,
      error: updateErr.message,
    });
    return { success: false, error: updateErr.message };
  }

  // Create contract from accepted proposal (client signed during Liquid phase; event didn't exist yet)
  const { data: acceptedProposal } = await supabase
    .from('proposals')
    .select('id, signed_at')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .eq('status', 'accepted')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (acceptedProposal?.id) {
    const signedAt = (acceptedProposal as { signed_at?: string | null }).signed_at ?? new Date().toISOString();
    // Pull the signed-PDF path from the proposal so contract.pdf_url carries the
    // audit trail forward (audit finding: legal/audit trail was always null).
    const { data: proposalRow } = await supabase
      .from('proposals')
      .select('signed_pdf_path')
      .eq('id', acceptedProposal.id)
      .maybeSingle();
    const signedPath = (proposalRow as { signed_pdf_path?: string | null } | null)?.signed_pdf_path ?? null;
    // Pass 4 Phase 0.5 (rescan fix C9): the naked insert swallowed RLS/FK errors silently.
    // Now captured to Sentry + surfaced as a warning. Non-fatal: the event still exists
    // and the PM can recreate the contract row manually if this fails. Mirrors the
    // crew-sync instrumentation pattern above.
    const { error: contractErr } = await supabase
      .from('contracts')
      .insert({
        workspace_id: workspaceId,
        event_id: eventId,
        status: 'signed',
        signed_at: signedAt,
        pdf_url: signedPath,
      })
      .select('id')
      .maybeSingle();
    if (contractErr) {
      Sentry.logger.error('crm.handoverDeal.contractInsertFailed', {
        dealId,
        eventId,
        workspaceId,
        proposalId: acceptedProposal.id,
        code: contractErr.code,
        message: contractErr.message,
      });
      warnings.push('Contract record creation failed — you may need to recreate it manually on the Plan tab.');
    }
  }

  revalidatePath('/crm');
  revalidatePath('/');
  revalidatePath('/network');
  revalidatePath('/events');
  revalidatePath(`/events/${eventId}`, 'layout');
  return { success: true, eventId, warnings: warnings.length > 0 ? warnings : undefined };
  });
}

/**
 * Seed dj_client_details from the client entity.
 * Writes archetype-aware fields so the DJ starts with context.
 * Also writes legacy dj_client_info for backward compat.
 */
async function seedDjClientInfo(
  supabase: Awaited<ReturnType<typeof createClient>>,
  eventId: string,
  clientEntityId: string,
  archetype: string | null,
) {
  const { data: entity } = await supabase
    .schema('directory')
    .from('entities')
    .select('display_name, type, attributes')
    .eq('id', clientEntityId)
    .maybeSingle();

  if (!entity) return;

  const displayName = entity.display_name ?? '';

  // Build archetype-aware client details
  const { emptyClientDetails } = await import('@/features/ops/lib/dj-prep-schema');
  const details = emptyClientDetails(archetype);

  // Resolve partner-name pair when entity is a couple; use canonical
  // COUPLE_ATTR keys (partner_a_first_name / partner_b_first_name).
  let partnerA = '';
  let partnerB = '';
  if (entity.type === 'couple') {
    const coupleAttrs = readEntityAttrs(entity.attributes, 'couple');
    partnerA = coupleAttrs[COUPLE_ATTR.partner_a_first] ?? '';
    partnerB = coupleAttrs[COUPLE_ATTR.partner_b_first] ?? '';
  }

  if (details.archetype === 'wedding' && entity.type === 'couple') {
    details.couple_name_a = partnerA;
    details.couple_name_b = partnerB;
  } else if (details.archetype === 'wedding') {
    // Non-couple entity (person, individual, company) on a wedding —
    // fall back to display name so the DJ has a starting point rather
    // than a blank prep sheet.
    details.couple_name_a = displayName;
  } else if (details.archetype === 'corporate') {
    details.company_name = displayName;
  } else if (details.archetype === 'social') {
    details.honoree_name = displayName;
  } else if (details.archetype === 'performance') {
    details.headliner = displayName;
  } else {
    details.primary_contact_name = displayName;
  }

  // Also build legacy couple names for backward compat
  let coupleNames = displayName;
  if (entity.type === 'couple' && partnerA && partnerB) {
    coupleNames = `${partnerA} & ${partnerB}`;
  }

  // Merge into existing run_of_show_data without clobbering other keys.
  // Surfaces RPC failures so DJ prep never silently lands blank.
  const { error: rpcError } = await supabase.rpc('patch_event_ros_data', {
    p_event_id: eventId,
    p_patch: {
      dj_client_details: details,
      dj_client_info: {
        couple_names: coupleNames,
        pronunciation: '',
        wedding_party: '',
        special_requests: '',
      },
    },
  });
  if (rpcError) {
    // Re-throw so the .catch handler at the call site captures to Sentry.
    throw new Error(`patch_event_ros_data failed: ${rpcError.message}`);
  }
}
