'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import * as Sentry from '@sentry/nextjs';
import { instrument } from '@/shared/lib/instrumentation';
import { resolveCrewConfirmationBatch } from '@/shared/lib/crew/resolve-crew-confirmation';
import { DealIds, EntityIds, DealCrewIds, WorkspaceIds, type DealId, type EntityId, type DealCrewId, type WorkspaceId } from '@/shared/types/branded-ids';
import { syncDealCrewFromProposalImpl } from './sync-from-proposal';
import type { DealCrewRow } from './types';

// =============================================================================
// getDealCrew — public action; runs sync then returns full crew list
// =============================================================================

export async function getDealCrew(dealId: string): Promise<DealCrewRow[]> {
  return instrument('getDealCrew', async () => {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();

    // Sync suggestions from proposal before fetching
    try {
      await syncDealCrewFromProposalImpl(supabase, dealId, workspaceId);
    } catch (syncErr) {
      // Log sync errors but don't block the fetch
      console.error('[getDealCrew] sync error:', syncErr instanceof Error ? syncErr.message : syncErr);
      Sentry.captureException(syncErr, { tags: { module: 'crm', action: 'getDealCrew.sync' } });
    }

    const { data, error } = await supabase.rpc('get_deal_crew_enriched', {
      p_deal_id: dealId,
      p_workspace_id: workspaceId,
    });

    if (error) {
      console.error('[getDealCrew] RPC error:', error.message, error.code, error.details);
      return [];
    }
    if (!data) {
      console.warn('[getDealCrew] RPC returned null/empty for deal:', dealId);
      return [];
    }

    // RPC returns a JSONB array — PostgREST may return it as a single object or array
    const rows = Array.isArray(data) ? data : [data];

    // Fetch emails from directory.entities separately (RPC doesn't return email)
    const entityIds = (rows as Record<string, unknown>[])
      .map((r) => r.entity_id as string | null)
      .filter((id): id is string => !!id);

    const emailMap = new Map<string, string | null>();
    if (entityIds.length > 0) {
      const { data: entities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, type, attributes')
        .in('id', entityIds);
      for (const e of (entities ?? []) as { id: string; type: string | null; attributes: unknown }[]) {
        const t = e.type ?? 'person';
        let email: string | null = null;
        if (t === 'person') {
          email = readEntityAttrs(e.attributes, 'person').email ?? null;
        } else if (t === 'individual') {
          email = readEntityAttrs(e.attributes, 'individual').email ?? null;
        } else if (t === 'company') {
          email = readEntityAttrs(e.attributes, 'company').support_email ?? null;
        }
        emailMap.set(e.id, email);
      }
    }

    // Pass 3 Phase 1 — overlay crew confirmation from the resolver.
    // Post-handoff the portal writes to crew_assignments and the Plan lens
    // reads confirmed_at/declined_at off this shape. Without the overlay,
    // a portal-confirmed crew member shows as pending on the Plan lens even
    // though Phase 1's mirror in respondToCrewAssignment writes both rows.
    // The overlay is the read-side guarantee that "one user-level fact,
    // every surface agrees". Pre-handoff (no event row) the lookup skips.
    let confirmationOverlay: Awaited<ReturnType<typeof resolveCrewConfirmationBatch>> | null = null;
    try {
       
      const { data: eventRow } = await supabase
        .schema('ops')
        .from('events')
        .select('id')
        .eq('deal_id', dealId)
        .limit(1)
        .maybeSingle();
      const eventId = (eventRow as { id?: string | null } | null)?.id ?? null;
      if (eventId) {
        const entityIds = (rows as Record<string, unknown>[])
          .map((r) => r.entity_id as string | null)
          .filter((id): id is string => !!id);
        if (entityIds.length > 0) {
          confirmationOverlay = await resolveCrewConfirmationBatch(supabase, eventId, entityIds);
        }
      }
    } catch (overlayErr) {
      // Non-fatal: if the resolver blows up we fall back to the raw RPC value.
      // Tag with fallback_used so an operator scanning Sentry can spot a
      // run where the Plan lens is showing un-overlaid (potentially stale)
      // crew confirmation data.
      Sentry.logger.error('crm.getDealCrew.confirmationOverlayFailed', {
        dealId,
        fallback_used: true,
        error: overlayErr instanceof Error ? overlayErr.message : String(overlayErr),
      });
    }

    return (rows as Record<string, unknown>[]).map((r) => {
      const entityId = (r.entity_id as string | null) ?? null;
      const rawConfirmed = (r.confirmed_at as string | null) ?? null;
      const rawDeclined = (r.declined_at as string | null) ?? null;
      const overlaid = entityId ? confirmationOverlay?.get(entityId) ?? null : null;
      // Prefer the resolver result when present — it already picks the
      // freshest non-null timestamp between deal_crew and crew_assignments.
      const confirmedAt = overlaid?.confirmedAt ?? rawConfirmed;
      const declinedAt = overlaid?.declinedAt ?? rawDeclined;
      return {
      id: r.id as string,
      deal_id: r.deal_id as string,
      entity_id: entityId,
      role_note: (r.role_note as string | null) ?? null,
      source: r.source as 'manual' | 'proposal',
      catalog_item_id: (r.catalog_item_id as string | null) ?? null,
      confirmed_at: confirmedAt,
      created_at: r.created_at as string,
      entity_name: (r.entity_name as string | null) ?? null,
      entity_type: (r.entity_type as string | null) ?? null,
      avatar_url: (r.avatar_url as string | null) ?? null,
      is_ghost: Boolean(r.is_ghost),
      first_name: (r.first_name as string | null) ?? null,
      last_name: (r.last_name as string | null) ?? null,
      job_title: (r.job_title as string | null) ?? null,
      phone: (r.phone as string | null) ?? null,
      market: (r.market as string | null) ?? null,
      union_status: (r.union_status as string | null) ?? null,
      w9_status: Boolean(r.w9_status),
      coi_expiry: (r.coi_expiry as string | null) ?? null,
      employment_status: (r.employment_status as 'internal_employee' | 'external_contractor' | null) ?? null,
      roster_rel_id: (r.roster_rel_id as string | null) ?? null,
      skills: Array.isArray(r.skills)
        ? (r.skills as Record<string, unknown>[]).map((s) => ({
            id: s.id as string,
            skill_tag: s.skill_tag as string,
            proficiency: (s.proficiency as string | null) ?? null,
            hourly_rate: (s.hourly_rate as number | null) ?? null,
            verified: Boolean(s.verified),
          }))
        : [],
      email: r.entity_id ? (emailMap.get(r.entity_id as string) ?? null) : null,
      package_name: (r.package_name as string | null) ?? null,
      dispatch_status: (r.dispatch_status as DealCrewRow['dispatch_status']) ?? null,
      call_time: (r.call_time as string | null) ?? null,
      call_time_slot_id: (r.call_time_slot_id as string | null) ?? null,
      arrival_location: (r.arrival_location as string | null) ?? null,
      day_rate: r.day_rate != null ? Number(r.day_rate) : null,
      crew_notes: (r.notes as string | null) ?? null,
      department: (r.department as string | null) ?? null,
      declined_at: declinedAt,
      payment_status: (r.payment_status as string | null) ?? null,
      travel_stipend: r.travel_stipend != null ? Number(r.travel_stipend) : null,
      per_diem: r.per_diem != null ? Number(r.per_diem) : null,
      kit_fee: r.kit_fee != null ? Number(r.kit_fee) : null,
      brings_own_gear: Boolean(r.brings_own_gear),
      gear_notes: (r.gear_notes as string | null) ?? null,
      status: ((r.status as DealCrewRow['status'] | null) ?? 'pending'),
      day_sheet_sent_count: Number(r.day_sheet_sent_count ?? 0),
      last_day_sheet_sent_at: (r.last_day_sheet_sent_at as string | null) ?? null,
      last_day_sheet_delivered_at: (r.last_day_sheet_delivered_at as string | null) ?? null,
      last_day_sheet_bounced_at: (r.last_day_sheet_bounced_at as string | null) ?? null,
      };
    });
  } catch (err) {
    console.error('[getDealCrew] CAUGHT ERROR:', err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getDealCrew' } });
    return [];
  }
  });
}

// =============================================================================
// addManualDealCrew
// Assigns a person to the deal crew. They are NOT confirmed — confirmation
// happens when the crew member accepts the assignment. ON CONFLICT upgrades
// an existing suggestion to manual-assigned rather than erroring.
// =============================================================================

export async function addManualDealCrew(
  rawDealId: string,
  rawEntityId: string,
  roleNote?: string,
): Promise<{ success: true; id: string; conflict?: string } | { success: false; error: string }> {
  return instrument('addManualDealCrew', async () => {
  let dealId: DealId, entityId: EntityId;
  try { dealId = DealIds.parse(rawDealId); entityId = EntityIds.parse(rawEntityId); }
  catch { return { success: false, error: 'Invalid input' }; }

  const wsRaw = await getActiveWorkspaceId();
  if (!wsRaw) return { success: false, error: 'Not authorised' };
  const workspaceId = WorkspaceIds.as(wsRaw);

  try {
    const supabase = await createClient();

    // Check for scheduling conflicts before assigning
    const conflict = await checkCrewConflict(supabase, dealId, entityId, workspaceId);

    // The (deal_id, entity_id) uniqueness is enforced by a PARTIAL unique
    // index (`WHERE entity_id IS NOT NULL`), which Postgres can't resolve via
    // `ON CONFLICT (deal_id, entity_id)`. Read-then-write keeps upsert
    // semantics without tripping that.
    const { data: existing } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('id')
      .eq('deal_id', dealId)
      .eq('entity_id', entityId)
      .maybeSingle();

    if (existing) {
      return { success: true, id: (existing as { id: string }).id, conflict: conflict ?? undefined };
    }

    const { data, error } = await supabase
      .schema('ops')
      .from('deal_crew')
      .insert({
        deal_id: dealId,
        workspace_id: workspaceId,
        entity_id: entityId,
        role_note: roleNote ?? null,
        source: 'manual',
        // Do NOT set confirmed_at — crew must confirm availability
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: (data as { id: string }).id, conflict: conflict ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  });
}

// =============================================================================
// confirmDealCrew — promotes a suggestion to confirmed crew
// =============================================================================

export async function confirmDealCrew(
  dealCrewRowId: string,
): Promise<{ success: true } | { success: false; error: string }> {
  return instrument('confirmDealCrew', async () => {
  const parsed = z.string().uuid().safeParse(dealCrewRowId);
  if (!parsed.success) return { success: false, error: 'Invalid ID' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();

    const { error, count } = await supabase
      .schema('ops')
      .from('deal_crew')
      .update({ confirmed_at: new Date().toISOString() }, { count: 'exact' })
      .eq('id', dealCrewRowId)
      .eq('workspace_id', workspaceId)
      .is('confirmed_at', null);

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: 'Already confirmed or not found' };
    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  });
}

// =============================================================================
// removeDealCrew
// =============================================================================

export async function removeDealCrew(
  dealCrewRowId: string,
): Promise<{ success: true; revertedGearCount: number } | { success: false; error: string }> {
  return instrument('removeDealCrew', async () => {
  const parsed = z.string().uuid().safeParse(dealCrewRowId);
  if (!parsed.success) return { success: false, error: 'Invalid ID' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();

    // Read the row first to capture entity_id and deal_id for gear cascade
    const { data: crewRow } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('entity_id, deal_id')
      .eq('id', dealCrewRowId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const removedEntityId = (crewRow?.entity_id as string) ?? null;
    const dealId = (crewRow?.deal_id as string) ?? null;

    const { error, count } = await supabase
      .schema('ops')
      .from('deal_crew')
      .delete({ count: 'exact' })
      .eq('id', dealCrewRowId)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: 'Not found' };

    // ── Cascade: revert crew-sourced gear items for the removed entity ─────
    let revertedGearCount = 0;
    if (removedEntityId && dealId) {
      // Find all events linked to this deal
      const { data: events } = await supabase
        .schema('ops')
        .from('events')
        .select('id')
        .eq('deal_id', dealId)
        .eq('workspace_id', workspaceId);

      const eventIds = ((events ?? []) as { id: string }[]).map((e) => e.id);

      if (eventIds.length > 0) {
        // Revert gear items sourced from this crew member back to company
        const { count: revertCount } = await supabase
          .schema('ops')
          .from('event_gear_items')
          .update({
            source: 'company',
            supplied_by_entity_id: null,
            kit_fee: null,
          }, { count: 'exact' })
          .in('event_id', eventIds)
          .eq('workspace_id', workspaceId)
          .eq('source', 'crew')
          .eq('supplied_by_entity_id', removedEntityId);

        revertedGearCount = revertCount ?? 0;
      }
    }

    return { success: true, revertedGearCount };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  });
}

// =============================================================================
// addManualOpenRole — creates a role-only slot with no named person
// =============================================================================

export async function addManualOpenRole(
  dealId: string,
  roleNote: string,
): Promise<{ success: true; id: string } | { success: false; error: string }> {
  return instrument('addManualOpenRole', async () => {
  const parsed = z.object({
    dealId: z.string().uuid(),
    roleNote: z.string().min(1).max(100),
  }).safeParse({ dealId, roleNote });
  if (!parsed.success) return { success: false, error: 'Invalid input' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  try {
    const supabase = await createClient();

    const { data, error } = await supabase
      .schema('ops')
      .from('deal_crew')
      .insert({
        deal_id: dealId,
        workspace_id: workspaceId,
        entity_id: null,
        role_note: roleNote.trim(),
        source: 'manual',
        confirmed_at: null,
      })
      .select('id')
      .single();

    if (error) return { success: false, error: error.message };
    return { success: true, id: (data as { id: string }).id };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  });
}

// =============================================================================
// assignDealCrewEntity — fills an open role slot with a named entity
// Sets entity_id on the row but does NOT confirm. Confirmation happens when
// the crew member accepts the assignment.
// The row must belong to the caller's active workspace (verified via deal join).
// =============================================================================

export async function assignDealCrewEntity(
  rawDealCrewRowId: string,
  rawEntityId: string,
): Promise<{ success: true; conflict?: string } | { success: false; error: string }> {
  return instrument('assignDealCrewEntity', async () => {
  let dealCrewRowId: DealCrewId, entityId: EntityId;
  try { dealCrewRowId = DealCrewIds.parse(rawDealCrewRowId); entityId = EntityIds.parse(rawEntityId); }
  catch { return { success: false, error: 'Invalid input' }; }

  const wsRaw = await getActiveWorkspaceId();
  if (!wsRaw) return { success: false, error: 'Not authorised' };
  const workspaceId = WorkspaceIds.as(wsRaw);

  try {
    const supabase = await createClient();

    // Verify the row belongs to a deal in the caller's workspace before mutating.

    const { data: row } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('id, deal_id, workspace_id')
      .eq('id', dealCrewRowId)
      .single();

    if (!row || row.workspace_id !== workspaceId) {
      return { success: false, error: 'Not authorised' };
    }

    // Check for scheduling conflicts
    const conflict = await checkCrewConflict(supabase, DealIds.as(row.deal_id), entityId, workspaceId);


    const { error, count } = await supabase
      .schema('ops')
      .from('deal_crew')
      .update(
        { entity_id: entityId },
        { count: 'exact' },
      )
      .eq('id', dealCrewRowId)
      .is('entity_id', null); // only fills truly open slots; won't overwrite assigned rows

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: 'Slot already filled or not found' };
    return { success: true, conflict: conflict ?? undefined };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  });
}

// =============================================================================
// checkCrewConflict — checks if entity is already assigned to another deal/event
// on the same date. Returns a warning string or null.
// =============================================================================

async function checkCrewConflict(
  supabase: Awaited<ReturnType<typeof createClient>>,
  dealId: DealId,
  entityId: EntityId,
  workspaceId: WorkspaceId,
): Promise<string | null> {
  try {
    // Get the deal's proposed date
    const { data: deal } = await supabase
      .from('deals')
      .select('proposed_date')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const proposedDate = (deal as { proposed_date?: string | null } | null)?.proposed_date;
    if (!proposedDate) return null;

    // Check other deal_crew assignments on the same date (excluding this deal), scoped to workspace
    const { data: otherDealCrew } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('deal_id')
      .eq('entity_id', entityId)
      .eq('workspace_id', workspaceId)
      .neq('deal_id', dealId);

    if (!otherDealCrew?.length) {
      // Also check ops.events for same-day events with this entity in crew
      const dayStart = `${proposedDate}T00:00:00.000Z`;
      const dayEnd = `${proposedDate}T23:59:59.999Z`;

      const { data: events } = await supabase
        .schema('ops')
        .from('events')
        .select('id, title, starts_at')
        .eq('workspace_id', workspaceId)
        .gte('starts_at', dayStart)
        .lte('starts_at', dayEnd);

      if (events?.length) {
        for (const evt of events as { id: string; title: string | null }[]) {
          const { count } = await supabase
            .schema('ops')
            .from('crew_assignments')
            .select('id', { count: 'exact', head: true })
            .eq('event_id', evt.id)
            .eq('entity_id', entityId);
          if (count && count > 0) {
            return `Already assigned to "${evt.title ?? 'an event'}" on this date`;
          }
        }
      }
      return null;
    }

    // Check if any of those other deals are on the same date
    const otherDealIds = (otherDealCrew as { deal_id: string }[]).map((r) => r.deal_id);
    const { data: conflictingDeals } = await supabase
      .from('deals')
      .select('id, title, proposed_date')
      .in('id', otherDealIds)
      .eq('proposed_date', proposedDate)
      .eq('workspace_id', workspaceId)
      .is('archived_at', null);

    if (conflictingDeals?.length) {
      const d = conflictingDeals[0] as { title?: string | null };
      return `Already on "${d.title ?? 'another deal'}" on this date`;
    }

    return null;
  } catch {
    return null; // Non-fatal — don't block assignment on conflict check failure
  }
}


// =============================================================================
// remindAllUnconfirmed — batch remind all pending (unconfirmed, not declined) crew
// Post-handoff only: reminders go via sendCrewReminderByEntity which looks up the
// matching crew_assignments row (workspace-scoped, status='requested') and delegates
// to sendCrewReminder. Returns counts for toast display.
//
// Pre-handoff (no deal.event_id yet): returns { sent: 0, skipped: pending.length,
// notHandedOff: true } so the caller can tell the user reminders are unavailable
// until the deal is handed over to production. Pre-handoff reminders would require
// a separate token flow on deal_crew which does not exist yet.
// =============================================================================

export type RemindAllResult = {
  sent: number;
  skipped: number;
  /** True if the deal has not been handed off yet — no crew_assignments exist. */
  notHandedOff?: boolean;
};

export async function remindAllUnconfirmed(
  dealId: string,
): Promise<RemindAllResult> {
  return instrument('remindAllUnconfirmed', async () => {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return { sent: 0, skipped: 0 };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { sent: 0, skipped: 0 };

  try {
    const supabase = await createClient();

    // Resolve event_id from deal — required because sendCrewReminderByEntity looks
    // up crew_assignments by event_id, and crew_assignments only exists post-handoff.
    const { data: dealRow } = await supabase
      .from('deals')
      .select('event_id')
      .eq('id', dealId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();
    const eventId = (dealRow as { event_id?: string | null } | null)?.event_id ?? null;

    // Fetch all pending crew (assigned but not confirmed, not declined)
    const { data: pendingRows } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('id, entity_id')
      .eq('deal_id', dealId)
      .eq('workspace_id', workspaceId)
      .not('entity_id', 'is', null)
      .is('confirmed_at', null)
      .is('declined_at', null);

    if (!pendingRows?.length) return { sent: 0, skipped: 0 };
    const pending = pendingRows as { id: string; entity_id: string }[];

    if (!eventId) {
      // Pre-handoff: no crew_assignments exist, so the token-based reminder path
      // can't reach these crew members yet. Surface the state honestly instead of
      // silently pretending the reminders went out.
      return { sent: 0, skipped: pending.length, notHandedOff: true };
    }

    // Dynamic import to avoid server-action circular type issues.
    const { sendCrewReminderByEntity } = await import('../send-crew-reminder-by-entity');

    let sent = 0;
    let skipped = 0;
    for (const row of pending) {
      const result = await sendCrewReminderByEntity(eventId, row.entity_id);
      if (result.success) {
        sent++;
      } else {
        skipped++;
      }
    }

    return { sent, skipped };
  } catch {
    return { sent: 0, skipped: 0 };
  }
  });
}

// =============================================================================
// getDealCrewForEvent — resolve event_id → deal_id → getDealCrew
// Used by Plan tab to read crew from the single source of truth.
// =============================================================================

export async function getDealCrewForEvent(eventId: string): Promise<DealCrewRow[]> {
  return instrument('getDealCrewForEvent', async () => {
  const parsed = z.string().uuid().safeParse(eventId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const supabase = await createClient();

  // Resolve deal_id from the event's back-reference
  const { data: evt } = await supabase
    .schema('ops')
    .from('events')
    .select('deal_id')
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  const dealId = (evt?.deal_id as string) ?? null;
  if (!dealId) return [];

  return getDealCrew(dealId);
  });
}

// =============================================================================
// getCrewGearSummary — lightweight crew gear counts for transport auto-suggestion
// Returns total assigned crew and how many bring their own gear.
// =============================================================================

export type CrewGearSummary = { total: number; selfEquipped: number };

export async function getCrewGearSummary(eventId: string): Promise<CrewGearSummary> {
  const parsed = z.string().uuid().safeParse(eventId);
  if (!parsed.success) return { total: 0, selfEquipped: 0 };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { total: 0, selfEquipped: 0 };

  try {
    const supabase = await createClient();

    // Resolve deal_id from event
    const { data: evt } = await supabase
      .schema('ops')
      .from('events')
      .select('deal_id')
      .eq('id', eventId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    const dealId = (evt?.deal_id as string) ?? null;
    if (!dealId) return { total: 0, selfEquipped: 0 };

    // Count assigned crew (entity_id not null) and how many bring own gear
    const { data, error } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('brings_own_gear')
      .eq('deal_id', dealId)
      .eq('workspace_id', workspaceId)
      .not('entity_id', 'is', null);

    if (error || !data) return { total: 0, selfEquipped: 0 };

    const rows = data as { brings_own_gear: boolean }[];
    return {
      total: rows.length,
      selfEquipped: rows.filter((r) => r.brings_own_gear).length,
    };
  } catch {
    return { total: 0, selfEquipped: 0 };
  }
}

// =============================================================================
// getDealCrewEquipmentNames — equipment names from all crew assigned to a deal.
// Used by Proposal Builder for internal source annotations.
// =============================================================================

export async function getDealCrewEquipmentNames(dealId: string): Promise<string[]> {
  const parsed = z.string().uuid().safeParse(dealId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();

    // Get entity IDs of assigned crew
    const { data: crewRows } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('entity_id')
      .eq('deal_id', dealId)
      .eq('workspace_id', workspaceId)
      .not('entity_id', 'is', null);

    const entityIds = (crewRows ?? []).map((r: { entity_id: string }) => r.entity_id);
    if (entityIds.length === 0) return [];

    // Fetch all equipment names for these entities
    const { data: equipment } = await supabase
      .schema('ops')
      .from('crew_equipment')
      .select('name')
      .in('entity_id', entityIds)
      .eq('workspace_id', workspaceId);

    const names: string[] = (equipment ?? []).map((r: { name: string }) => r.name.toLowerCase());
    return Array.from(new Set(names));
  } catch {
    return [];
  }
}

// =============================================================================
// updateCrewDispatch — update ops-specific fields on a deal_crew row
// Used by Plan tab CrewFlightCheck for dispatch status, call times, etc.
// =============================================================================

export async function updateCrewDispatch(
  dealCrewRowId: string,
  updates: {
    dispatch_status?: 'standby' | 'en_route' | 'on_site' | 'wrapped' | null;
    call_time?: string | null;
    call_time_slot_id?: string | null;
    arrival_location?: string | null;
    day_rate?: number | null;
    notes?: string | null;
    payment_status?: 'pending' | 'completed' | 'submitted' | 'approved' | 'processing' | 'paid' | null;
    payment_date?: string | null;
    travel_stipend?: number | null;
    per_diem?: number | null;
    kit_fee?: number | null;
    brings_own_gear?: boolean;
    gear_notes?: string | null;
  },
): Promise<{ success: true } | { success: false; error: string }> {
  return instrument('updateCrewDispatch', async () => {
  const parsed = z.string().uuid().safeParse(dealCrewRowId);
  if (!parsed.success) return { success: false, error: 'Invalid ID' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'Not authorised' };

  // Validate dispatch_status if provided
  if (updates.dispatch_status !== undefined && updates.dispatch_status !== null) {
    const valid = ['standby', 'en_route', 'on_site', 'wrapped'];
    if (!valid.includes(updates.dispatch_status)) {
      return { success: false, error: 'Invalid dispatch status' };
    }
  }

  try {
    const supabase = await createClient();

    // Snapshot the pay fields before the update so we can diff after and log
    // rate changes to crew_comms_log. Non-pay updates skip this step and
    // behave exactly as before.
    const rateKeys = ['day_rate', 'travel_stipend', 'per_diem', 'kit_fee'] as const;
    const touchesRates = rateKeys.some((k) => k in updates);
    let before: Record<(typeof rateKeys)[number], number | null> | null = null;
    let eventIdForLog: string | null = null;
    if (touchesRates) {
      const { data: prev } = await supabase
        .schema('ops')
        .from('deal_crew')
        .select('day_rate, travel_stipend, per_diem, kit_fee, deal_id')
        .eq('id', dealCrewRowId)
        .eq('workspace_id', workspaceId)
        .maybeSingle();
      if (prev) {
        before = {
          day_rate: (prev as { day_rate: number | null }).day_rate ?? null,
          travel_stipend: (prev as { travel_stipend: number | null }).travel_stipend ?? null,
          per_diem: (prev as { per_diem: number | null }).per_diem ?? null,
          kit_fee: (prev as { kit_fee: number | null }).kit_fee ?? null,
        };
        // Resolve the event so the log row can be filtered by event.
        const dealId = (prev as { deal_id: string }).deal_id;
        const { data: evt } = await supabase
          .schema('ops')
          .from('events')
          .select('id')
          .eq('deal_id', dealId)
          .eq('workspace_id', workspaceId)
          .maybeSingle();
        eventIdForLog = (evt?.id as string) ?? null;
      }
    }

    const { error, count } = await supabase
      .schema('ops')
      .from('deal_crew')
      .update(updates, { count: 'exact' })
      .eq('id', dealCrewRowId)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };
    if (count === 0) return { success: false, error: 'Not found' };

    // Log rate change if anything actually moved. We log a single rate_changed
    // row with before/after for all four fields so the activity feed reads
    // as one event rather than four. Failure here is non-fatal.
    if (touchesRates && before) {
      const after: Record<(typeof rateKeys)[number], number | null> = {
        day_rate: 'day_rate' in updates ? (updates.day_rate ?? null) : before.day_rate,
        travel_stipend: 'travel_stipend' in updates ? (updates.travel_stipend ?? null) : before.travel_stipend,
        per_diem: 'per_diem' in updates ? (updates.per_diem ?? null) : before.per_diem,
        kit_fee: 'kit_fee' in updates ? (updates.kit_fee ?? null) : before.kit_fee,
      };
      const changed = rateKeys.filter((k) => (before as Record<string, number | null>)[k] !== after[k]);
      if (changed.length > 0) {
        const beforeTotal = (before.day_rate ?? 0) + (before.travel_stipend ?? 0) + (before.per_diem ?? 0) + (before.kit_fee ?? 0);
        const afterTotal = (after.day_rate ?? 0) + (after.travel_stipend ?? 0) + (after.per_diem ?? 0) + (after.kit_fee ?? 0);
        const delta = afterTotal - beforeTotal;
        const deltaLabel = delta === 0
          ? 'rate adjusted'
          : `total ${delta > 0 ? '+' : '−'}$${Math.abs(delta).toLocaleString()}`;
        const { data: { user } } = await supabase.auth.getUser();
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await supabase
          .schema('ops')
          .from('crew_comms_log')
          .insert({
            workspace_id: workspaceId,
            deal_crew_id: dealCrewRowId,
            event_id: eventIdForLog,
            channel: 'system',
            event_type: 'rate_changed',
            actor_user_id: user?.id ?? null,
            summary: `Rate changed — ${deltaLabel}`,
            payload: { before, after, changed_fields: changed },
          });
      }
    }

    return { success: true };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Unknown error' };
  }
  });
}
