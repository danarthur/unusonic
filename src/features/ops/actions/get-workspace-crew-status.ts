'use server';

import 'server-only';
import { createClient } from '@/shared/api/supabase/server';

/* ── Types ───────────────────────────────────────────────────────── */

export type CrewMember = {
  assignment_id: string;
  entity_id: string | null;
  assignee_name: string | null;
  role: string | null;
  status: 'requested' | 'confirmed' | 'dispatched';
  call_time_override: string | null;
  phone: string | null;
};

export type EventCrewStatus = {
  event_id: string;
  title: string | null;
  starts_at: string | null;
  ends_at: string | null;
  venue_name: string | null;
  crew: CrewMember[];
  summary: {
    confirmed: number;
    requested: number;
    dispatched: number;
    open: number;
  };
};

/* ── Data fetcher ────────────────────────────────────────────────── */

/**
 * Fetches upcoming events for the workspace with full crew rosters.
 * Used by the Production Manager crew-status dashboard.
 */
export async function getWorkspaceCrewStatus(
  workspaceId: string,
): Promise<EventCrewStatus[]> {
  const supabase = await createClient();

  // 1. Get upcoming events for the workspace
  const { data: events, error: eventsErr } = await supabase
    .schema('ops')
    .from('events')
    .select('id, title, starts_at, ends_at, venue_name')
    .eq('workspace_id', workspaceId)
    .gte('starts_at', new Date().toISOString())
    .order('starts_at', { ascending: true })
    .limit(20);

  if (eventsErr || !events?.length) {
    if (eventsErr) console.error('[ops] getWorkspaceCrewStatus events:', eventsErr.message);
    return [];
  }

  const eventIds = events.map((e: { id: string }) => e.id);

  // 2. Get all crew assignments for those events
  const { data: assignments, error: assignErr } = await supabase
    .schema('ops')
    .from('crew_assignments')
    .select('id, event_id, entity_id, assignee_name, role, status, call_time_override')
    .in('event_id', eventIds)
    .eq('workspace_id', workspaceId)
    .neq('status', 'removed')
    .order('role', { ascending: true });

  if (assignErr) {
    console.error('[ops] getWorkspaceCrewStatus assignments:', assignErr.message);
  }

  const allAssignments = (assignments ?? []) as Array<{
    id: string;
    event_id: string;
    entity_id: string | null;
    assignee_name: string | null;
    role: string | null;
    status: string;
    call_time_override: string | null;
  }>;

  // 3. Resolve entity phone numbers from directory
  const entityIds = [
    ...new Set(allAssignments.map((a) => a.entity_id).filter(Boolean) as string[]),
  ];

  const phoneMap: Record<string, string | null> = {};
  const nameMap: Record<string, string | null> = {};

  if (entityIds.length > 0) {
    const { data: entities } = await supabase
      .schema('directory')
      .from('entities')
      .select('id, display_name, attributes')
      .in('id', entityIds);

    if (entities) {
      for (const e of entities as Array<{
        id: string;
        display_name: string | null;
        attributes: Record<string, unknown> | null;
      }>) {
        const attrs = e.attributes as Record<string, unknown> | null;
        phoneMap[e.id] = (attrs?.phone as string) ?? null;
        nameMap[e.id] = e.display_name;
      }
    }
  }

  // 4. Assemble per-event crew status
  const assignmentsByEvent = new Map<string, typeof allAssignments>();
  for (const a of allAssignments) {
    const list = assignmentsByEvent.get(a.event_id) ?? [];
    list.push(a);
    assignmentsByEvent.set(a.event_id, list);
  }

  return (events as Array<{
    id: string;
    title: string | null;
    starts_at: string | null;
    ends_at: string | null;
    venue_name: string | null;
  }>).map((evt) => {
    const crewList = assignmentsByEvent.get(evt.id) ?? [];

    const summary = { confirmed: 0, requested: 0, dispatched: 0, open: 0 };
    const crew: CrewMember[] = crewList.map((a) => {
      if (!a.entity_id) {
        summary.open++;
      } else if (a.status === 'confirmed') {
        summary.confirmed++;
      } else if (a.status === 'requested') {
        summary.requested++;
      } else if (a.status === 'dispatched') {
        summary.dispatched++;
      }

      return {
        assignment_id: a.id,
        entity_id: a.entity_id,
        assignee_name: a.entity_id
          ? nameMap[a.entity_id] ?? a.assignee_name
          : a.assignee_name,
        role: a.role,
        status: a.status as CrewMember['status'],
        call_time_override: a.call_time_override,
        phone: a.entity_id ? phoneMap[a.entity_id] ?? null : null,
      };
    });

    return {
      event_id: evt.id,
      title: evt.title,
      starts_at: evt.starts_at,
      ends_at: evt.ends_at,
      venue_name: evt.venue_name,
      crew,
      summary,
    };
  });
}
