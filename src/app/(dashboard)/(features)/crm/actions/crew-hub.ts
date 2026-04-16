'use server';

import { z } from 'zod/v4';
import * as Sentry from '@sentry/nextjs';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { addGearItem, type EventGearItem } from './event-gear-items';

// =============================================================================
// Types
// =============================================================================

export type CrewCommsLogEntry = {
  id: string;
  channel: 'email' | 'sms' | 'phone' | 'in_person' | 'portal' | 'system';
  event_type:
    | 'day_sheet_sent'
    | 'day_sheet_delivered'
    | 'day_sheet_bounced'
    | 'schedule_update_sent'
    | 'schedule_update_delivered'
    | 'schedule_update_bounced'
    | 'manual_nudge_sent'
    | 'phone_call_logged'
    | 'note_added'
    | 'confirmation_received'
    | 'decline_received'
    | 'status_changed'
    | 'rate_changed';
  occurred_at: string;
  actor_user_id: string | null;
  summary: string | null;
  payload: Record<string, unknown>;
};

export type CueAssignment = {
  cue_id: string;
  title: string | null;
  start_time: string | null;
  duration_minutes: number;
  type: string;
  notes: string | null;
};

export type WaypointKind =
  | 'truck_pickup'
  | 'gear_pickup'
  | 'depart'
  | 'venue_arrival'
  | 'setup'
  | 'set_by'
  | 'doors'
  | 'wrap'
  | 'custom';

export type CrewWaypoint = {
  id: string;
  deal_crew_id: string;
  kind: WaypointKind;
  custom_label: string | null;
  /** HH:MM 24-hour. */
  time: string;
  location_name: string | null;
  location_address: string | null;
  notes: string | null;
  sort_order: number;
  actual_time: string | null;
  created_at: string;
  updated_at: string;
};

export type CrewOwnedKit = {
  /** ops.crew_equipment.id */
  equipmentId: string;
  name: string;
  category: string;
  quantity: number;
  catalogItemId: string | null;
  verificationStatus: 'pending' | 'approved' | 'rejected' | 'needs_review' | string;
  /** True when an event_gear_items row already exists on this event with
   *  this entity as the supplier for this catalog item. Prevents double-add. */
  alreadyOnEvent: boolean;
};

// =============================================================================
// getCrewCommsLog — the activity feed for one crew row
// =============================================================================

export async function getCrewCommsLog(dealCrewId: string): Promise<CrewCommsLogEntry[]> {
  const parsed = z.string().uuid().safeParse(dealCrewId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .schema('ops')
      .from('crew_comms_log')
      .select('id, channel, event_type, occurred_at, actor_user_id, summary, payload')
      .eq('deal_crew_id', dealCrewId)
      .eq('workspace_id', workspaceId)
      .order('occurred_at', { ascending: false })
      .limit(100);

    if (error) {
      Sentry.logger.error('crm.crewHub.getCrewCommsLogFailed', {
        dealCrewId,
        error: error.message,
      });
      return [];
    }
    return (data ?? []) as CrewCommsLogEntry[];
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getCrewCommsLog' } });
    return [];
  }
}

// =============================================================================
// getCueScheduleForCrew — ROS cues this entity is assigned to
//
// Returns crew-relevant cues for one person on one event. Filters on
// run_of_show_cues.assigned_crew JSONB (array of entries with entity_id).
// Ordered by start_time so it reads as a personal timeline.
// =============================================================================

export async function getCueScheduleForCrew(
  eventId: string,
  entityId: string,
): Promise<CueAssignment[]> {
  const parsedEventId = z.string().uuid().safeParse(eventId);
  const parsedEntityId = z.string().uuid().safeParse(entityId);
  if (!parsedEventId.success || !parsedEntityId.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    // assigned_crew is a JSONB array; use contains with a partial match.
    const { data, error } = await supabase
      .from('run_of_show_cues')
      .select('id, title, start_time, duration_minutes, type, notes, assigned_crew')
      .eq('event_id', eventId)
      .order('start_time', { ascending: true, nullsFirst: false });

    if (error) {
      Sentry.logger.error('crm.crewHub.getCueScheduleFailed', {
        eventId,
        entityId,
        error: error.message,
      });
      return [];
    }

    const rows = (data ?? []) as {
      id: string;
      title: string | null;
      start_time: string | null;
      duration_minutes: number;
      type: string;
      notes: string | null;
      assigned_crew: { entity_id?: string | null }[] | null;
    }[];

    return rows
      .filter((r) =>
        Array.isArray(r.assigned_crew) &&
        r.assigned_crew.some((a) => a?.entity_id === entityId),
      )
      .map((r) => ({
        cue_id: r.id,
        title: r.title,
        start_time: r.start_time,
        duration_minutes: r.duration_minutes,
        type: r.type,
        notes: r.notes,
      }));
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getCueScheduleForCrew' } });
    return [];
  }
}

// =============================================================================
// updateCrewNotes — PM-only freeform note for this person on this show.
// Writes to ops.deal_crew.notes (surfaced as crew_notes on DealCrewRow) which
// is the SAME field the notes icon on the list row toggles. Keeps a single
// source of truth instead of the parallel `internal_note` column that shipped
// in migration 20260414190000 and is now effectively unused.
// =============================================================================

const UpdateNoteSchema = z.object({
  dealCrewId: z.string().uuid(),
  note: z.string().max(4000).nullable(),
});

export async function updateCrewNotes(input: {
  dealCrewId: string;
  note: string | null;
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = UpdateNoteSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .update({ notes: parsed.data.note })
      .eq('id', parsed.data.dealCrewId)
      .eq('workspace_id', workspaceId);

    if (error) {
      Sentry.logger.error('crm.crewHub.updateCrewNotesFailed', {
        dealCrewId: parsed.data.dealCrewId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'updateCrewNotes' } });
    return { success: false, error: message };
  }
}

// =============================================================================
// logCrewPhoneCall — manual activity entry from the rail's "Log call" action
// =============================================================================

const LogPhoneCallSchema = z.object({
  dealCrewId: z.string().uuid(),
  eventId: z.string().uuid().nullable(),
  summary: z.string().max(500),
});

export async function logCrewPhoneCall(input: {
  dealCrewId: string;
  eventId: string | null;
  summary: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = LogPhoneCallSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .schema('ops')
      .from('crew_comms_log')
      .insert({
        workspace_id: workspaceId,
        deal_crew_id: parsed.data.dealCrewId,
        event_id: parsed.data.eventId,
        channel: 'phone',
        event_type: 'phone_call_logged',
        actor_user_id: user?.id ?? null,
        summary: parsed.data.summary,
        payload: {},
      });

    if (error) {
      Sentry.logger.error('crm.crewHub.logPhoneCallFailed', {
        dealCrewId: parsed.data.dealCrewId,
        error: error.message,
      });
      return { success: false, error: error.message };
    }
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'logCrewPhoneCall' } });
    return { success: false, error: message };
  }
}

// =============================================================================
// getCrewSuppliedGear — items this crew member is bringing to this event
//
// Filters ops.event_gear_items by event_id + supplied_by_entity_id. Used to
// fill the "Bringing to this show" list in the Crew Detail Rail.
// =============================================================================

export async function getCrewSuppliedGear(input: {
  eventId: string;
  entityId: string;
}): Promise<EventGearItem[]> {
  const parsed = z
    .object({ eventId: z.string().uuid(), entityId: z.string().uuid() })
    .safeParse(input);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema('ops')
      .from('event_gear_items')
      .select(
        'id, event_id, name, quantity, status, catalog_package_id, is_sub_rental, sub_rental_supplier_id, department, operator_entity_id, sort_order, history, created_at, source, supplied_by_entity_id, kit_fee',
      )
      .eq('event_id', parsed.data.eventId)
      .eq('workspace_id', workspaceId)
      .eq('supplied_by_entity_id', parsed.data.entityId)
      .order('sort_order', { ascending: true });

    if (error) {
      Sentry.logger.error('crm.crewHub.getCrewSuppliedGearFailed', {
        eventId: parsed.data.eventId,
        entityId: parsed.data.entityId,
        error: error.message,
      });
      return [];
    }

    // supplied_by_name is enriched at the UI layer when needed — we already
    // know the name in the rail.
    return ((data ?? []) as Record<string, unknown>[]).map((r) => ({
      id: r.id as string,
      event_id: r.event_id as string,
      name: r.name as string,
      quantity: r.quantity as number,
      status: r.status as EventGearItem['status'],
      catalog_package_id: (r.catalog_package_id as string | null) ?? null,
      is_sub_rental: Boolean(r.is_sub_rental),
      sub_rental_supplier_id: (r.sub_rental_supplier_id as string | null) ?? null,
      department: (r.department as string | null) ?? null,
      operator_entity_id: (r.operator_entity_id as string | null) ?? null,
      sort_order: (r.sort_order as number) ?? 0,
      history: (r.history as EventGearItem['history']) ?? [],
      created_at: r.created_at as string,
      source: (r.source as EventGearItem['source']) ?? 'company',
      supplied_by_entity_id: (r.supplied_by_entity_id as string | null) ?? null,
      supplied_by_name: null,
      kit_fee: r.kit_fee != null ? Number(r.kit_fee) : null,
    }));
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getCrewSuppliedGear' } });
    return [];
  }
}

// =============================================================================
// getCrewOwnedKit — the person's approved ops.crew_equipment, with a per-item
// flag showing whether it's already on this event.
//
// Powers the "Bring from kit" picker in the rail. Skips rejected / pending
// equipment so the PM only sees what the workspace has actually verified.
// =============================================================================

export async function getCrewOwnedKit(input: {
  entityId: string;
  eventId: string | null;
}): Promise<CrewOwnedKit[]> {
  const parsed = z
    .object({
      entityId: z.string().uuid(),
      eventId: z.string().uuid().nullable(),
    })
    .safeParse(input);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();

    // Approved kit items
    const { data: kitRows, error: kitErr } = await supabase
      .schema('ops')
      .from('crew_equipment')
      .select('id, name, category, quantity, catalog_item_id, verification_status')
      .eq('entity_id', parsed.data.entityId)
      .eq('workspace_id', workspaceId)
      .eq('verification_status', 'approved')
      .order('category', { ascending: true });

    if (kitErr) {
      Sentry.logger.error('crm.crewHub.getCrewOwnedKitFailed', {
        entityId: parsed.data.entityId,
        error: kitErr.message,
      });
      return [];
    }

    const kit = (kitRows ?? []) as {
      id: string;
      name: string;
      category: string;
      quantity: number;
      catalog_item_id: string | null;
      verification_status: string;
    }[];

    // Items already on this event for this supplier — so we can grey them out.
    let onEventCatalogIds = new Set<string>();
    let onEventNames = new Set<string>();
    if (parsed.data.eventId) {
      const { data: onEvent } = await supabase
        .schema('ops')
        .from('event_gear_items')
        .select('name, catalog_package_id')
        .eq('event_id', parsed.data.eventId)
        .eq('workspace_id', workspaceId)
        .eq('supplied_by_entity_id', parsed.data.entityId);

      for (const r of (onEvent ?? []) as { name: string; catalog_package_id: string | null }[]) {
        if (r.catalog_package_id) onEventCatalogIds.add(r.catalog_package_id);
        onEventNames.add(r.name.trim().toLowerCase());
      }
    }

    return kit.map((item) => {
      const alreadyOnEvent =
        (item.catalog_item_id && onEventCatalogIds.has(item.catalog_item_id)) ||
        onEventNames.has(item.name.trim().toLowerCase());
      return {
        equipmentId: item.id,
        name: item.name,
        category: item.category,
        quantity: item.quantity,
        catalogItemId: item.catalog_item_id,
        verificationStatus: item.verification_status,
        alreadyOnEvent: Boolean(alreadyOnEvent),
      };
    });
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'getCrewOwnedKit' } });
    return [];
  }
}

// =============================================================================
// bringKitItemsToEvent — bulk-add selected crew_equipment items to this event
// as crew-sourced event_gear_items. Idempotent: silently skips items that
// already exist for this supplier (name OR catalog match).
// =============================================================================

const BringKitItemsSchema = z.object({
  eventId: z.string().uuid(),
  entityId: z.string().uuid(),
  equipmentIds: z.array(z.string().uuid()).min(1).max(50),
});

export async function bringKitItemsToEvent(input: {
  eventId: string;
  entityId: string;
  equipmentIds: string[];
}): Promise<{ success: true; created: number; skipped: number } | { success: false; error: string }> {
  const parsed = BringKitItemsSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();

    // Fetch the kit items we're about to add
    const { data: kitRows, error: kitErr } = await supabase
      .schema('ops')
      .from('crew_equipment')
      .select('id, name, category, quantity, catalog_item_id, verification_status')
      .in('id', parsed.data.equipmentIds)
      .eq('entity_id', parsed.data.entityId)
      .eq('workspace_id', workspaceId);

    if (kitErr || !kitRows || kitRows.length === 0) {
      return { success: false, error: 'Kit items not found.' };
    }

    // Existing event_gear_items for this supplier on this event — dedupe set
    const { data: existing } = await supabase
      .schema('ops')
      .from('event_gear_items')
      .select('name, catalog_package_id')
      .eq('event_id', parsed.data.eventId)
      .eq('workspace_id', workspaceId)
      .eq('supplied_by_entity_id', parsed.data.entityId);

    const existingCatalogIds = new Set<string>();
    const existingNames = new Set<string>();
    for (const r of (existing ?? []) as { name: string; catalog_package_id: string | null }[]) {
      if (r.catalog_package_id) existingCatalogIds.add(r.catalog_package_id);
      existingNames.add(r.name.trim().toLowerCase());
    }

    let created = 0;
    let skipped = 0;
    for (const item of kitRows as {
      id: string;
      name: string;
      category: string;
      quantity: number;
      catalog_item_id: string | null;
      verification_status: string;
    }[]) {
      if (item.verification_status !== 'approved') {
        skipped += 1;
        continue;
      }
      if (item.catalog_item_id && existingCatalogIds.has(item.catalog_item_id)) {
        skipped += 1;
        continue;
      }
      if (existingNames.has(item.name.trim().toLowerCase())) {
        skipped += 1;
        continue;
      }

      // addGearItem validates workspace membership + RLS. source='crew' +
      // supplied_by_entity_id produce a crew-attributed row. catalog_item_id
      // links back to the package so kit compliance stays accurate.
      // addGearItem returns `{ id } | { error }` (no `success` field).
      const result = await addGearItem(parsed.data.eventId, {
        name: item.name,
        quantity: item.quantity,
        catalog_package_id: item.catalog_item_id ?? undefined,
        source: 'crew',
        supplied_by_entity_id: parsed.data.entityId,
      });

      if ('id' in result) {
        created += 1;
        if (item.catalog_item_id) existingCatalogIds.add(item.catalog_item_id);
        existingNames.add(item.name.trim().toLowerCase());
      } else {
        skipped += 1;
      }
    }

    // Reflect on deal_crew — brings_own_gear=true when at least one item landed.
    if (created > 0) {
      const { data: evt } = await supabase
        .schema('ops')
        .from('events')
        .select('deal_id')
        .eq('id', parsed.data.eventId)
        .maybeSingle();
      const dealId = (evt?.deal_id as string) ?? null;
      if (dealId) {
        await supabase
          .schema('ops')
          .from('deal_crew')
          .update({ brings_own_gear: true })
          .eq('deal_id', dealId)
          .eq('entity_id', parsed.data.entityId)
          .eq('workspace_id', workspaceId);
      }
    }

    return { success: true, created, skipped };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'bringKitItemsToEvent' } });
    return { success: false, error: message };
  }
}

// =============================================================================
// replaceCrewMember — swap one assigned crew row for another person.
//
// LASSO state machine semantics: the original row flips to status='replaced'
// (history preserved) and a new row is inserted with status='offered' for
// the same role + department + catalog linkage + call_time. Both movements
// land in crew_comms_log so the Crew Hub activity feed reflects the swap.
// =============================================================================

const ReplaceCrewSchema = z.object({
  dealCrewId: z.string().uuid(),
  newEntityId: z.string().uuid(),
});

export async function replaceCrewMember(input: {
  dealCrewId: string;
  newEntityId: string;
}): Promise<
  | { success: true; newDealCrewId: string }
  | { success: false; error: string }
> {
  const parsed = ReplaceCrewSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();
    const { data: { user } } = await supabase.auth.getUser();
    const actorUserId = user?.id ?? null;

    // 1. Load the row we're replacing. Pull only the fields we need to clone.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: original, error: originalErr } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .select('id, deal_id, workspace_id, role_note, source, catalog_item_id, department, call_time, call_time_slot_id, day_rate, entity_id')
      .eq('id', parsed.data.dealCrewId)
      .eq('workspace_id', workspaceId)
      .maybeSingle();

    if (originalErr || !original) {
      return { success: false, error: 'Original crew row not found.' };
    }
    if (!original.entity_id) {
      // Replacing an open slot is really just assignment — caller should use
      // assignDealCrewEntity for that flow.
      return { success: false, error: 'Row has no assignee to replace. Use assign instead.' };
    }
    if (original.entity_id === parsed.data.newEntityId) {
      return { success: false, error: 'Same person — no swap needed.' };
    }

    // 2. Resolve the event_id for log + audit context.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: evt } = await (supabase as any)
      .schema('ops')
      .from('events')
      .select('id')
      .eq('deal_id', original.deal_id)
      .maybeSingle();
    const eventId = (evt?.id as string) ?? null;

    // 3. Mark original row replaced. Preserve confirmed_at/declined_at history;
    //    we only change status so ordering filters stay sensible.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: markErr } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .update({ status: 'replaced' })
      .eq('id', parsed.data.dealCrewId)
      .eq('workspace_id', workspaceId);

    if (markErr) {
      return { success: false, error: markErr.message };
    }

    // 4. Insert the replacement row. Unique index on (deal_id, entity_id) will
    //    reject if the new person is already on this deal — we catch that and
    //    translate to a useful error instead of a raw Postgres message.
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertErr } = await (supabase as any)
      .schema('ops')
      .from('deal_crew')
      .insert({
        deal_id: original.deal_id,
        workspace_id: original.workspace_id,
        entity_id: parsed.data.newEntityId,
        role_note: original.role_note,
        source: original.source,
        catalog_item_id: original.catalog_item_id,
        department: original.department,
        call_time: original.call_time,
        call_time_slot_id: original.call_time_slot_id,
        day_rate: original.day_rate,
        status: 'offered',
      })
      .select('id')
      .single();

    if (insertErr || !inserted) {
      // Try to roll the original back so the UI doesn't end up with a dangling
      // 'replaced' row and no replacement. Best-effort: if the rollback also
      // fails the PM will see the replaced status and can manually recover.
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase as any)
        .schema('ops')
        .from('deal_crew')
        .update({ status: original.entity_id ? (original.confirmed_at ? 'confirmed' : 'pending') : 'pending' })
        .eq('id', parsed.data.dealCrewId)
        .eq('workspace_id', workspaceId);
      const isDupe = insertErr?.message?.includes('deal_crew_deal_entity_uniq');
      return {
        success: false,
        error: isDupe
          ? 'That person is already on this deal.'
          : (insertErr?.message ?? 'Insert failed'),
      };
    }

    const newDealCrewId = (inserted as { id: string }).id;

    // 5. Log both sides of the swap so the Crew Hub activity feed tells the
    //    story from either angle. Failures here are non-fatal.
    const nowIso = new Date().toISOString();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase as any)
      .schema('ops')
      .from('crew_comms_log')
      .insert([
        {
          workspace_id: workspaceId,
          deal_crew_id: parsed.data.dealCrewId,
          event_id: eventId,
          channel: 'system',
          event_type: 'status_changed',
          occurred_at: nowIso,
          actor_user_id: actorUserId,
          summary: 'Replaced by PM',
          payload: { new_entity_id: parsed.data.newEntityId, new_deal_crew_id: newDealCrewId },
        },
        {
          workspace_id: workspaceId,
          deal_crew_id: newDealCrewId,
          event_id: eventId,
          channel: 'system',
          event_type: 'status_changed',
          occurred_at: nowIso,
          actor_user_id: actorUserId,
          summary: 'Added as replacement',
          payload: { replaces_deal_crew_id: parsed.data.dealCrewId, replaces_entity_id: original.entity_id },
        },
      ]);

    return { success: true, newDealCrewId };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'replaceCrewMember' } });
    return { success: false, error: message };
  }
}

// =============================================================================
// Waypoints — per-person time markers augmenting deal_crew.call_time.
//
// deal_crew.call_time stays the "primary call" (what shows on the crew row
// and the day sheet header). Waypoints are additional timed steps this
// person needs to hit: truck pickup, gear pickup, venue arrival, set-by
// deadline, doors, wrap, or custom.
// =============================================================================

const WAYPOINT_KINDS = [
  'truck_pickup',
  'gear_pickup',
  'depart',
  'venue_arrival',
  'setup',
  'set_by',
  'doors',
  'wrap',
  'custom',
] as const;

const TIME_24H_RE = /^[0-2]\d:[0-5]\d$/;

export async function listCrewWaypoints(dealCrewId: string): Promise<CrewWaypoint[]> {
  const parsed = z.string().uuid().safeParse(dealCrewId);
  if (!parsed.success) return [];

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  try {
    const supabase = await createClient();
    const { data, error } = await supabase
      .schema('ops')
      .from('deal_crew_waypoints')
      .select('id, deal_crew_id, kind, custom_label, time, location_name, location_address, notes, sort_order, actual_time, created_at, updated_at')
      .eq('deal_crew_id', dealCrewId)
      .eq('workspace_id', workspaceId)
      .order('sort_order', { ascending: true })
      .order('time', { ascending: true });

    if (error) {
      Sentry.logger.error('crm.crewHub.listWaypointsFailed', {
        dealCrewId,
        error: error.message,
      });
      return [];
    }
    return (data ?? []) as CrewWaypoint[];
  } catch (err) {
    Sentry.captureException(err, { tags: { module: 'crm', action: 'listCrewWaypoints' } });
    return [];
  }
}

const AddWaypointSchema = z
  .object({
    dealCrewId: z.string().uuid(),
    kind: z.enum(WAYPOINT_KINDS),
    customLabel: z.string().max(100).nullable().optional(),
    time: z.string().regex(TIME_24H_RE),
    locationName: z.string().max(200).nullable().optional(),
    locationAddress: z.string().max(500).nullable().optional(),
    notes: z.string().max(500).nullable().optional(),
    sortOrder: z.number().int().min(0).max(1000).optional(),
  })
  .refine(
    (v) => (v.kind === 'custom' ? !!v.customLabel?.trim() : true),
    { message: 'customLabel required when kind=custom', path: ['customLabel'] },
  );

export async function addCrewWaypoint(input: {
  dealCrewId: string;
  kind: WaypointKind;
  customLabel?: string | null;
  time: string;
  locationName?: string | null;
  locationAddress?: string | null;
  notes?: string | null;
  sortOrder?: number;
}): Promise<{ success: true; id: string } | { success: false; error: string }> {
  const parsed = AddWaypointSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();

    // Derive the next sort_order when not supplied — append to the end.
    let sortOrder = parsed.data.sortOrder;
    if (sortOrder === undefined) {
      const { data: existing } = await supabase
        .schema('ops')
        .from('deal_crew_waypoints')
        .select('sort_order')
        .eq('deal_crew_id', parsed.data.dealCrewId)
        .eq('workspace_id', workspaceId)
        .order('sort_order', { ascending: false })
        .limit(1);
      const max = existing && existing.length > 0
        ? (existing[0] as { sort_order: number }).sort_order
        : -1;
      sortOrder = max + 1;
    }

    const { data, error } = await supabase
      .schema('ops')
      .from('deal_crew_waypoints')
      .insert({
        workspace_id: workspaceId,
        deal_crew_id: parsed.data.dealCrewId,
        kind: parsed.data.kind,
        // Schema constraint requires custom_label null for non-custom kinds.
        custom_label: parsed.data.kind === 'custom' ? (parsed.data.customLabel ?? null) : null,
        time: parsed.data.time,
        location_name: parsed.data.locationName ?? null,
        location_address: parsed.data.locationAddress ?? null,
        notes: parsed.data.notes ?? null,
        sort_order: sortOrder,
      })
      .select('id')
      .single();

    if (error || !data) {
      return { success: false, error: error?.message ?? 'Insert failed' };
    }
    return { success: true, id: (data as { id: string }).id };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'addCrewWaypoint' } });
    return { success: false, error: message };
  }
}

const UpdateWaypointSchema = z.object({
  id: z.string().uuid(),
  patch: z
    .object({
      kind: z.enum(WAYPOINT_KINDS).optional(),
      customLabel: z.string().max(100).nullable().optional(),
      time: z.string().regex(TIME_24H_RE).optional(),
      locationName: z.string().max(200).nullable().optional(),
      locationAddress: z.string().max(500).nullable().optional(),
      notes: z.string().max(500).nullable().optional(),
      sortOrder: z.number().int().min(0).max(1000).optional(),
      actualTime: z.string().datetime().nullable().optional(),
    })
    .refine((p) => Object.keys(p).length > 0, { message: 'Empty patch' }),
});

export async function updateCrewWaypoint(input: {
  id: string;
  patch: {
    kind?: WaypointKind;
    customLabel?: string | null;
    time?: string;
    locationName?: string | null;
    locationAddress?: string | null;
    notes?: string | null;
    sortOrder?: number;
    actualTime?: string | null;
  };
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = UpdateWaypointSchema.safeParse(input);
  if (!parsed.success) return { success: false, error: parsed.error.issues[0]?.message ?? 'Invalid input.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();

    const dbPatch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if ('kind' in parsed.data.patch && parsed.data.patch.kind !== undefined) {
      dbPatch.kind = parsed.data.patch.kind;
      // If we're switching away from custom, clear the stale custom_label so
      // the check constraint passes.
      if (parsed.data.patch.kind !== 'custom' && !('customLabel' in parsed.data.patch)) {
        dbPatch.custom_label = null;
      }
    }
    if ('customLabel' in parsed.data.patch) dbPatch.custom_label = parsed.data.patch.customLabel ?? null;
    if ('time' in parsed.data.patch) dbPatch.time = parsed.data.patch.time;
    if ('locationName' in parsed.data.patch) dbPatch.location_name = parsed.data.patch.locationName ?? null;
    if ('locationAddress' in parsed.data.patch) dbPatch.location_address = parsed.data.patch.locationAddress ?? null;
    if ('notes' in parsed.data.patch) dbPatch.notes = parsed.data.patch.notes ?? null;
    if ('sortOrder' in parsed.data.patch) dbPatch.sort_order = parsed.data.patch.sortOrder;
    if ('actualTime' in parsed.data.patch) dbPatch.actual_time = parsed.data.patch.actualTime ?? null;

    const { error } = await supabase
      .schema('ops')
      .from('deal_crew_waypoints')
      .update(dbPatch)
      .eq('id', parsed.data.id)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'updateCrewWaypoint' } });
    return { success: false, error: message };
  }
}

export async function removeCrewWaypoint(input: {
  id: string;
}): Promise<{ success: true } | { success: false; error: string }> {
  const parsed = z.object({ id: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { success: false, error: 'Invalid id.' };

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { success: false, error: 'No active workspace.' };

  try {
    const supabase = await createClient();
    const { error } = await supabase
      .schema('ops')
      .from('deal_crew_waypoints')
      .delete()
      .eq('id', parsed.data.id)
      .eq('workspace_id', workspaceId);

    if (error) return { success: false, error: error.message };
    return { success: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    Sentry.captureException(err, { tags: { module: 'crm', action: 'removeCrewWaypoint' } });
    return { success: false, error: message };
  }
}
