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
import { SeriesRuleSchema, expandSeriesRule, type SeriesRule } from '@/shared/lib/series-rule';
import { seedHandoffNarrative } from './seed-handoff-narrative';
import { migrateCallerDealSessionToEvent } from './migrate-deal-session-to-event';

export type HandoverResult =
  | { success: true; eventId: string; warnings?: string[] }
  | { success: false; error: string };

/** Vitals from the handoff wizard: date/time, venue, client, optional explicit timezone. */
export type HandoverVitals = {
  start_at: string;
  end_at: string;
  venue_entity_id?: string | null;
  /** Set on ops.projects.client_entity_id for the project used by the new event. */
  client_entity_id?: string | null;
  /**
   * Explicit IANA timezone override. The wizard does not surface this field
   * today, but the resolution chain in handoverDeal accepts it as the highest-
   * priority source (see resolveEventTimezone) so future wizard work can wire
   * a tz picker without re-plumbing the action. 'UTC' is treated as a column-
   * default sentinel and skipped by resolveEventTimezone.
   */
  timezone?: string | null;
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
    .select('id, title, status, proposed_date, proposed_end_date, workspace_id, event_id, event_start_time, event_end_time, event_archetype')
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
    revalidatePath('/events');
    revalidatePath('/events');
    revalidatePath(`/events/${eid}`, 'layout');
    return { success: true, eventId: eid };
  }

  // The deals.status column is constrained to ('working','won','lost') at
  // the DB level (deals_status_check), so 'won' is the only handover-eligible
  // value — earlier code referenced 'contract_signed'/'deposit_received' as
  // legacy rollout slugs, but those values can never appear in the column.
  // The pipeline stage is the source of truth for sales progression; status
  // 'won' is the post-collapse kind set by the BEFORE trigger when the deal
  // enters a stage tagged contract_signed / deposit_received / won.
  const status = (r.status as string) ?? '';
  if (status !== 'won') {
    return {
      success: false,
      error: 'Deal must be marked won before handover. Advance the deal through your pipeline first.',
    };
  }

  // Every deal created via `create_deal_complete` v3 has its own project (deal_id set).
  // For legacy deals without one, we lazily create here. Series carry `is_series=true`
  // + `series_rule` on the project row; handover expands the rule into N events.
  const { data: dealProject, error: projErr } = await supabase
    .schema('ops')
    .from('projects')
    .select('id, is_series, series_rule')
    .eq('deal_id', dealId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (projErr) {
    return { success: false, error: projErr.message };
  }

  let projectId: string;
  let isSeries = false;
  let seriesRule: SeriesRule | null = null;

  if (dealProject) {
    projectId = (dealProject as { id: string }).id;
    isSeries = Boolean((dealProject as { is_series?: boolean }).is_series);
    if (isSeries) {
      const raw = (dealProject as { series_rule?: unknown }).series_rule;
      const parsed = SeriesRuleSchema.safeParse(raw);
      if (!parsed.success) {
        return { success: false, error: `Series rule on project is malformed: ${parsed.error.message}` };
      }
      seriesRule = parsed.data;
    }
  } else {
    // Legacy path — deal predates create_deal_complete v3 and has no project yet.
    const { data: inserted, error: insertErr } = await supabase
      .schema('ops')
      .from('projects')
      .insert({
        workspace_id: workspaceId,
        name: (r.title as string)?.trim() || 'Production',
        status: 'lead',
        deal_id: dealId,
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

  // PR #1 (handover-pipeline data-bug, 2026-05-07): the legacy path
  // (prism.tsx:445 banner button) calls handoverDeal(dealId) with no payload,
  // leaving venueEntityId + clientEntityId null and writing all-null context
  // columns onto ops.events. That breaks the crew portal (no venue entity to
  // dereference) and the client portal (.eq('client_entity_id', ...) filter
  // returns nothing). Fix: when no payload, resolve both IDs from
  // ops.deal_stakeholders the same way get-event-summary.ts does on the
  // fallback path. Audit: docs/audits/handover-pipeline-data-bug-investigation-2026-05-07.md §5a.
  if (!payload?.vitals) {
    const resolved = await resolveContextFromStakeholders(supabase, dealId, workspaceId);
    venueEntityId = resolved.venueEntityId;
    clientEntityId = resolved.clientEntityId;
  }

  // §3.2: resolve IANA timezone for the event record. Used for the ops.events.timezone
  // column AND (in the legacy path) to convert local times to proper UTC instants.
  // Resolution chain (see src/shared/lib/timezone.ts): payload → venue attrs →
  // workspace → SAFE_FALLBACK_TZ. 'UTC' is treated as a sentinel at every step
  // because both ops.events.timezone and workspaces.timezone default to 'UTC'.
  // The wizard doesn't surface a tz picker today, so payload?.vitals?.timezone
  // is effectively always undefined at runtime; the field exists on
  // HandoverVitals to give a future wizard tz picker a wired path through the
  // server contract. PR #2 followup F3 (Guardian §122-133 + §218-223) replaced
  // the prior `as { timezone?: string | null }` cast with the typed field.
  const eventTimezone = await resolveEventTimezone({
    payload: payload?.vitals?.timezone ?? null,
    venueId: venueEntityId,
    workspaceId,
  });

  // Denormalize venue display_name AND attributes.address onto ops.events.
  // - location_name keeps the event detail surfaces working if the venue
  //   entity is later soft-deleted or renamed.
  // - location_address feeds the crew portal map link, the daysheet PDF, and
  //   the dispatch summary "where" line. Neither path wrote this before
  //   PR #1, so 100% of historical rows had location_address NULL.
  //
  // Format mirrors update-event-venue.ts: prefer the pre-formatted
  // attributes.formatted_address (written by Google Places autocomplete),
  // fall through to [street, city, state, postal_code].join(', ').
  let locationName: string | null = null;
  let locationAddress: string | null = null;
  if (venueEntityId) {
    const { data: venueEntity } = await supabase
      .schema('directory')
      .from('entities')
      .select('display_name, attributes')
      .eq('id', venueEntityId)
      .maybeSingle();
    if (venueEntity) {
      locationName = (venueEntity as { display_name?: string | null }).display_name ?? null;
      const venueAttrs = readEntityAttrs((venueEntity as { attributes?: unknown }).attributes, 'venue');
      const composed = [venueAttrs.street, venueAttrs.city, venueAttrs.state, venueAttrs.postal_code]
        .filter(Boolean)
        .join(', ') || null;
      locationAddress = venueAttrs.formatted_address ?? composed;
    }
  }

  // Build the list of (starts_at, ends_at) pairs we'll materialize. One of three shapes:
  //   - series:    N pairs, one per date in expanded series_rule; same start/end time each day
  //   - multi_day: ONE pair spanning proposed_date → proposed_end_date
  //   - single:   ONE pair on proposed_date
  //
  // Legacy path (no handoff wizard): use deal's start/end_time with proposedDate fallback.
  const proposedEndDate = r.proposed_end_date ? String(r.proposed_end_date) : null;

  type EventDraft = { starts_at: string; ends_at: string };
  const eventDrafts: EventDraft[] = [];

  if (isSeries && seriesRule) {
    const dates = expandSeriesRule(seriesRule);
    if (dates.length === 0) {
      return { success: false, error: 'Series rule expanded to zero dates.' };
    }
    const startTime = (r.event_start_time as string) ?? '08:00';
    const endTime = (r.event_end_time as string) ?? '18:00';
    for (const d of dates) {
      eventDrafts.push({
        starts_at: toVenueInstant(d, startTime, eventTimezone),
        ends_at: toVenueInstant(d, endTime, eventTimezone),
      });
    }
  } else if (payload?.vitals) {
    // Handoff wizard supplied vitals for a singleton
    eventDrafts.push({ starts_at: startAt, ends_at: endAt });
  } else if (proposedEndDate && proposedEndDate !== proposedDate) {
    // Multi-day single event: span proposed_date → proposed_end_date
    const startTime = (r.event_start_time as string) ?? '08:00';
    const endTime = (r.event_end_time as string) ?? '18:00';
    eventDrafts.push({
      starts_at: toVenueInstant(proposedDate, startTime, eventTimezone),
      ends_at: toVenueInstant(proposedEndDate, endTime, eventTimezone),
    });
  } else {
    // Singleton legacy path
    const startTime = (r.event_start_time as string) ?? '08:00';
    const endTime = (r.event_end_time as string) ?? '18:00';
    eventDrafts.push({
      starts_at: toVenueInstant(proposedDate, startTime, eventTimezone),
      ends_at: toVenueInstant(proposedDate, endTime, eventTimezone),
    });
  }

  // Pass 4 Phase 0.5 (rescan fix N1): set status + lifecycle_status explicitly on handoff.
  // Before this fix, lifecycle_status defaulted to NULL, which silently failed the
  // `.in('lifecycle_status', [...])` filters on Lobby widgets (use-lobby-events.ts:62),
  // dashboard urgency alerts (get-urgency-alerts.ts:76/305), CRM hooks (useCRM.ts:43),
  // and global search (search-global.ts:36). Every new event after handoff was invisible
  // on the Lobby and urgency surfaces until someone manually advanced the lifecycle.
  // The ('planned', 'production') pair is valid per ops.event_status_pair_valid (see
  // src/shared/lib/event-status/pair-valid.ts and the corresponding DB trigger).
  const archetypeForEvents = (deal as Record<string, unknown>).event_archetype as string | null;
  const insertRows = eventDrafts.map((d) => ({
    project_id: projectId,
    workspace_id: workspaceId,
    deal_id: dealId,
    title: eventName,
    starts_at: d.starts_at,
    ends_at: d.ends_at,
    status: 'planned',
    lifecycle_status: 'production',
    timezone: eventTimezone,
    venue_entity_id: venueEntityId,
    client_entity_id: clientEntityId,
    location_name: locationName,
    location_address: locationAddress,
    event_archetype: archetypeForEvents,
    run_of_show_data: runOfShowData,
  }));

  const { data: insertedEvents, error: eventErr } = await supabase
    .schema('ops')
    .from('events')
    .insert(insertRows)
    .select('id, starts_at');

  if (eventErr || !insertedEvents || insertedEvents.length === 0) {
    Sentry.logger.error('crm.handoverDeal.insertEventFailed', {
      dealId,
      workspaceId,
      projectId,
      isSeries,
      eventCount: insertRows.length,
      error: eventErr?.message ?? 'no events inserted',
    });
    return { success: false, error: eventErr?.message ?? 'Could not create events for deal.' };
  }

  // Sort by starts_at to pick the first show as the canonical deal.event_id —
  // .insert() returns in insert order, but for series we want chronological.
  const sortedEvents = [...(insertedEvents as Array<{ id: string; starts_at: string }>)]
    .sort((a, b) => a.starts_at.localeCompare(b.starts_at));
  const eventId = sortedEvents[0].id;

  // Link any pre-handover deal_crew rows (event_id still NULL) to the first
  // event. For singletons/multi-day this is the canonical event. For series
  // it's the first chronological show — the owner then clicks "Set for whole
  // series" to fan the template to the rest. Keeps event-scoped reads
  // consistent without losing rows the owner assigned pre-handover.
  {
    const { error: crewLinkErr } = await supabase
      .schema('ops')
      .from('deal_crew')
      .update({ event_id: eventId })
      .eq('deal_id', dealId)
      .eq('workspace_id', workspaceId)
      .is('event_id', null);
    if (crewLinkErr) {
      Sentry.logger.error('crm.handoverDeal.linkPreHandoverCrewFailed', {
        dealId,
        eventId,
        workspaceId,
        error: crewLinkErr.message,
      });
    }
  }

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
        eventId,
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
  const firstStartsAt = sortedEvents[0]?.starts_at ?? startAt ?? null;
  publishDomainEvent({
    workspaceId,
    eventId,
    type: 'show.created',
    payload: {
      eventId,
      dealId,
      clientEntityId,
      archetype,
      startsAt: firstStartsAt,
      // For series, endsAt of the first show; domain consumers interested in
      // the full date span should read ops.events directly. isSeries flag here
      // is what a consumer (Follow-Up Engine) needs to differentiate.
      endsAt: eventDrafts[0]?.ends_at ?? endAt ?? null,
      isSeries,
      seriesEventCount: eventDrafts.length,
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

  // Phase 3 §3.6 — migrate the caller's active Aion deal-scoped session to
  // the new event's scope. R6: handoff must never be gated on Aion, so all
  // failures log to Sentry and swallow. Non-blocking on purpose (race-safe:
  // if the user is mid-stream, the stream finishes on the deal prefix and
  // the next turn reads the fresh event-scoped session row).
  await migrateCallerDealSessionToEvent(supabase, dealId, eventId, workspaceId);

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

  // Phase 3 §3.5 — seed the deal narrative with handoff facts. Fire-and-forget
  // via service role; a failure here doesn't roll back the handoff. The
  // DealNarrativeStrip on the event page reads cortex.memory on next render.
  seedHandoffNarrative({ dealId, workspaceId, eventId }).catch((err) => {
    Sentry.logger.warn('crm.handoverDeal.seedNarrativeFailed', {
      dealId,
      eventId,
      workspaceId,
      message: err instanceof Error ? err.message : 'unknown',
    });
  });

  revalidatePath('/events');
  revalidatePath('/');
  revalidatePath('/network');
  revalidatePath('/events');
  revalidatePath(`/events/${eventId}`, 'layout');
  return { success: true, eventId, warnings: warnings.length > 0 ? warnings : undefined };
  });
}

/**
 * Resolve the venue + client entity IDs for a deal from ops.deal_stakeholders.
 *
 * Mirrors the COALESCE order used by handoff-wizard.tsx (where the wizard
 * pre-fills its pickers from stakeholders) and get-event-summary.ts (where the
 * event reader uses stakeholders as a fallback chain when the column is
 * NULL). Keeping these three call sites aligned matters — a divergent COALESCE
 * order here would write the *opposite* node of the dual-node pattern into
 * the column.
 *
 * Dual-node refresher:
 *   - bill_to       — entity_id is the billing-contact person, organization_id
 *                     is the company (when client is a company; NULL when it's
 *                     an individual). We prefer entity_id so the client portal
 *                     scopes to the person who signed in.
 *   - venue_contact — organization_id is the venue (an org/venue entity),
 *                     entity_id is typically NULL. We prefer organization_id.
 *
 * Uses the session client (RLS-enforced): the deal-ownership gate in
 * handoverDeal at the top of the action already proved workspace ownership,
 * and ops.deal_stakeholders_select gates on the same workspace check via
 * deal_id → public.deals.workspace_id. This matches the 5 other call sites
 * that read ops.deal_stakeholders with the session client (get-event-summary,
 * events/page, resolve-deal-hosts, deal-stakeholders, etc.). PR #2 followup F1
 * from docs/audits/handover-pipeline-pr1-guardian-2026-05-07.md.
 */
async function resolveContextFromStakeholders(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealId: string,
  workspaceId: string,
): Promise<{ venueEntityId: string | null; clientEntityId: string | null }> {
  const { data: stakeholders, error: stakeholdersErr } = await supabase
    .schema('ops')
    .from('deal_stakeholders')
    .select('role, entity_id, organization_id, is_primary')
    .eq('deal_id', dealId)
    .in('role', ['bill_to', 'venue_contact']);

  if (stakeholdersErr) {
    // PR #2 followup F4 (Guardian risk 11): a silent error here looks
    // identical to "deal has no stakeholders" and re-introduces the very bug
    // PR #1 fixed. Surface to Sentry; return nulls so handover still
    // proceeds — the column-NULL state is recoverable via the existing
    // reader-side fallback chains in get-event-summary.ts and
    // build-event-scope-prefix.ts. Throwing would block handoff on an Aion-
    // adjacent failure, which is exactly the kind of coupling R6 forbids.
    Sentry.logger.error('crm.handoverDeal.stakeholderLookupFailed', {
      dealId,
      workspaceId,
      error: stakeholdersErr.message,
    });
    return { venueEntityId: null, clientEntityId: null };
  }

  const rows = (stakeholders ?? []) as Array<{
    role: string;
    entity_id: string | null;
    organization_id: string | null;
    is_primary: boolean;
  }>;
  // Prefer is_primary=true when multiple rows share the same role. Same sort
  // as get-event-summary.ts so we never disagree about which stakeholder is
  // canonical.
  const sorted = rows.slice().sort((a, b) => Number(b.is_primary) - Number(a.is_primary));

  const billTo = sorted.find((s) => s.role === 'bill_to');
  const venueContact = sorted.find((s) => s.role === 'venue_contact');

  return {
    clientEntityId: billTo?.entity_id ?? billTo?.organization_id ?? null,
    venueEntityId: venueContact?.organization_id ?? venueContact?.entity_id ?? null,
  };
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


