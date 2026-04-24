'use server';

import { z } from 'zod/v4';
import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type DayCrewSlot = {
  dealCrewId: string;
  entityId: string | null;
  entityName: string | null;
  role: string | null;
  department: string | null;
  confirmed: boolean;
};

export type DayGearSlot = {
  itemId: string;
  name: string;
  status: string;
  quantity: number;
};

export type DayEventSlice = {
  eventId: string;
  dealId: string | null;
  title: string;
  startsAt: string;
  endsAt: string | null;
  crew: DayCrewSlot[];
  gear: DayGearSlot[];
};

export type CrossEventConflict = {
  entityId: string;
  entityName: string;
  resourceType: 'crew' | 'gear';
  eventIds: string[];
  eventTitles: string[];
};

export type DayResourceView = {
  date: string;
  events: DayEventSlice[];
  conflicts: CrossEventConflict[];
};

// =============================================================================
// getDayResourceView
// Fetches all events for a given date, their crew and gear, and cross-references
// to find conflicts (same crew member or gear item on 2+ events).
// =============================================================================

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

export async function getDayResourceView(date: string): Promise<DayResourceView | null> {
  if (!dateSchema.safeParse(date).success) return null;

  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return null;

  const supabase = await createClient();

  // ── 1. Find all events on this date ──────────────────────────────────────
  // Query ops.events where starts_at date matches + workspace scoping via project
  // Scope to events whose starts_at falls on the requested date (server-side filter)
  const dayStart = `${date}T00:00:00.000Z`;
  const dayEnd = `${date}T23:59:59.999Z`;

  const { data: eventsRaw } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, deal_id, run_of_show_data, project:projects!inner(workspace_id)')
    .eq('projects.workspace_id', workspaceId)
    .gte('starts_at', dayStart)
    .lte('starts_at', dayEnd);

  if (!eventsRaw || eventsRaw.length === 0) return null;

  const dayEvents = eventsRaw as unknown as {
    id: string;
    title: string | null;
    starts_at: string;
    ends_at: string | null;
    deal_id: string | null;
    run_of_show_data: Record<string, unknown> | null;
    project: { workspace_id: string };
  }[];

  if (dayEvents.length === 0) return null;

  // ── 2. Batch-fetch deal_crew for all deals on this day ────────────────────
  const dealIds = [...new Set(dayEvents.map((e) => e.deal_id).filter(Boolean))] as string[];
  const crewByDealId = new Map<string, DayCrewSlot[]>();

  if (dealIds.length > 0) {
    const { data: crewRows } = await supabase
      .schema('ops')
      .from('deal_crew')
      .select('id, deal_id, entity_id, role_note, department, confirmed_at')
      .in('deal_id', dealIds)
      .eq('workspace_id', workspaceId);

    // Resolve entity names
    const entityIds = [...new Set(
      ((crewRows ?? []) as { entity_id: string | null }[])
        .map((r) => r.entity_id)
        .filter(Boolean),
    )] as string[];

    let entityNameMap = new Map<string, string>();
    if (entityIds.length > 0) {
      const { data: entities } = await supabase
        .schema('directory')
        .from('entities')
        .select('id, display_name')
        .in('id', entityIds);
      entityNameMap = new Map(
        (entities ?? []).map((e) => [e.id as string, (e.display_name as string) ?? 'Unnamed']),
      );
    }

    // Group by deal_id
    for (const row of (crewRows ?? []) as {
      id: string;
      deal_id: string;
      entity_id: string | null;
      role_note: string | null;
      department: string | null;
      confirmed_at: string | null;
    }[]) {
      const list = crewByDealId.get(row.deal_id) ?? [];
      list.push({
        dealCrewId: row.id,
        entityId: row.entity_id,
        entityName: row.entity_id ? (entityNameMap.get(row.entity_id) ?? null) : null,
        role: row.role_note,
        department: row.department,
        confirmed: !!row.confirmed_at,
      });
      crewByDealId.set(row.deal_id, list);
    }
  }

  // ── 3. Build event slices with gear from run_of_show_data ────────────────
  const events: DayEventSlice[] = dayEvents.map((e) => {
    const ros = e.run_of_show_data as Record<string, unknown> | null;
    const gearItems = (ros?.gear_items as { id?: string; name: string; status?: string; quantity?: number }[] | undefined) ?? [];

    return {
      eventId: e.id,
      dealId: e.deal_id,
      title: e.title ?? 'Untitled',
      startsAt: e.starts_at,
      endsAt: e.ends_at,
      crew: e.deal_id ? (crewByDealId.get(e.deal_id) ?? []) : [],
      gear: gearItems.map((g, idx) => ({
        itemId: g.id ?? `gear-${idx}`,
        name: g.name,
        status: g.status ?? 'allocated',
        quantity: g.quantity ?? 1,
      })),
    };
  });

  // ── 4. Cross-reference: find crew conflicts ──────────────────────────────
  // A crew conflict = same entity_id appears in 2+ events
  const crewEntityEvents = new Map<string, { eventIds: string[]; eventTitles: string[]; name: string }>();

  for (const ev of events) {
    for (const slot of ev.crew) {
      if (!slot.entityId) continue;
      const entry = crewEntityEvents.get(slot.entityId) ?? { eventIds: [], eventTitles: [], name: slot.entityName ?? 'Unknown' };
      entry.eventIds.push(ev.eventId);
      entry.eventTitles.push(ev.title);
      if (slot.entityName) entry.name = slot.entityName;
      crewEntityEvents.set(slot.entityId, entry);
    }
  }

  // ── 5. Cross-reference: find gear conflicts ──────────────────────────────
  // A gear conflict = same item name appears in 2+ events
  const gearNameEvents = new Map<string, { eventIds: string[]; eventTitles: string[] }>();

  for (const ev of events) {
    for (const slot of ev.gear) {
      const key = slot.name.toLowerCase().trim();
      if (!key) continue;
      const entry = gearNameEvents.get(key) ?? { eventIds: [], eventTitles: [] };
      entry.eventIds.push(ev.eventId);
      entry.eventTitles.push(ev.title);
      gearNameEvents.set(key, entry);
    }
  }

  // ── 6. Collect conflicts ─────────────────────────────────────────────────
  const conflicts: CrossEventConflict[] = [];

  for (const [entityId, info] of crewEntityEvents) {
    if (info.eventIds.length >= 2) {
      conflicts.push({
        entityId,
        entityName: info.name,
        resourceType: 'crew',
        eventIds: info.eventIds,
        eventTitles: info.eventTitles,
      });
    }
  }

  for (const [gearName, info] of gearNameEvents) {
    if (info.eventIds.length >= 2) {
      conflicts.push({
        entityId: gearName,
        entityName: gearName,
        resourceType: 'gear',
        eventIds: info.eventIds,
        eventTitles: info.eventTitles,
      });
    }
  }

  return { date, events, conflicts };
}
