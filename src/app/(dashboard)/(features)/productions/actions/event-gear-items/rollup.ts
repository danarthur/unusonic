'use server';

/**
 * event-gear-items/rollup.ts — workspace-wide crew-sourced equipment rollup.
 *
 * `getCrewSourcedEquipmentRollup` aggregates crew-supplied gear across all
 * upcoming events in the active workspace, grouped by crew member. PM tool,
 * not bound to a single event.
 */

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { readEntityAttrs } from '@/shared/lib/entity-attrs';
import type { CrewEquipmentRollupEntry } from './types';

/**
 * Returns all crew-sourced event gear items across upcoming events (next N
 * days, default 30) for the active workspace, grouped by crew member.
 * Useful for PMs to see "across all my upcoming shows, what gear is being
 * sourced from crew?"
 */
export async function getCrewSourcedEquipmentRollup(
  options: { daysAhead?: number } = {},
): Promise<CrewEquipmentRollupEntry[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return [];

  const daysAhead = options.daysAhead ?? 30;
  const now = new Date();
  const cutoff = new Date(now.getTime() + daysAhead * 24 * 60 * 60 * 1000);

  const supabase = await createClient();

  // 1. Get upcoming events in the workspace within the date range
  const { data: events } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at')
    .eq('workspace_id', workspaceId)
    .gte('starts_at', now.toISOString())
    .lte('starts_at', cutoff.toISOString())
    .order('starts_at', { ascending: true });

  type EventRow = { id: string; title: string | null; starts_at: string };
  const eventRows: EventRow[] = (events ?? []) as EventRow[];
  if (eventRows.length === 0) return [];

  const eventIds = eventRows.map((e) => e.id);

  // 2. Get all crew-sourced gear items for these events
  const { data: gearItems } = await supabase
    .schema('ops')
    .from('event_gear_items')
    .select('event_id, name, quantity, supplied_by_entity_id')
    .eq('workspace_id', workspaceId)
    .eq('source', 'crew')
    .in('event_id', eventIds)
    .not('supplied_by_entity_id', 'is', null);

  type GearRow = {
    event_id: string;
    name: string;
    quantity: number;
    supplied_by_entity_id: string;
  };
  const gearRows: GearRow[] = (gearItems ?? []) as GearRow[];
  if (gearRows.length === 0) return [];

  // 3. Resolve entity names
  const entityIds = [...new Set(gearRows.map((g) => g.supplied_by_entity_id))];
  const { data: entities } = await supabase
    .schema('directory')
    .from('entities')
    .select('id, display_name, attributes')
    .in('id', entityIds);

  const nameMap = new Map<string, string>();
  for (const e of (entities ?? []) as { id: string; display_name: string | null; attributes: Record<string, unknown> | null }[]) {
    const attrs = readEntityAttrs(e.attributes, 'person');
    const fullName = [attrs.first_name, attrs.last_name].filter(Boolean).join(' ').trim();
    nameMap.set(e.id, fullName || e.display_name || 'Unknown');
  }

  // 4. Build event lookup
  const eventMap = new Map<string, EventRow>();
  for (const ev of eventRows) eventMap.set(ev.id, ev);

  // 5. Group by entity, then by event
  const grouped = new Map<string, Map<string, { name: string; quantity: number }[]>>();

  for (const gear of gearRows) {
    if (!grouped.has(gear.supplied_by_entity_id)) {
      grouped.set(gear.supplied_by_entity_id, new Map());
    }
    const entityEvents = grouped.get(gear.supplied_by_entity_id)!;
    if (!entityEvents.has(gear.event_id)) {
      entityEvents.set(gear.event_id, []);
    }
    entityEvents.get(gear.event_id)!.push({
      name: gear.name,
      quantity: gear.quantity,
    });
  }

  // 6. Build result
  const result: CrewEquipmentRollupEntry[] = [];

  for (const [entityId, eventItems] of grouped) {
    const evts: CrewEquipmentRollupEntry['events'] = [];
    for (const [eventId, items] of eventItems) {
      const ev = eventMap.get(eventId);
      if (!ev) continue;
      evts.push({
        eventId,
        eventTitle: ev.title ?? 'Untitled event',
        eventDate: ev.starts_at,
        items,
      });
    }
    // Sort events by date
    evts.sort((a, b) => a.eventDate.localeCompare(b.eventDate));
    result.push({
      entityId,
      entityName: nameMap.get(entityId) ?? 'Unknown',
      events: evts,
    });
  }

  // Sort by entity name
  result.sort((a, b) => a.entityName.localeCompare(b.entityName));

  return result;
}
