/**
 * Calendar feature - Server Action: fetch full event dossier by id
 * Joins projects. Optional: crew, guests, run_of_show when schema exists.
 * @module features/calendar/api/get-event-details
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import type { EventDetailDTO } from '../model/event-detail';
import type { EventStatus } from '../model/types';
import { getEventColor } from '../model/types';

const EVENT_STATUS_VALUES: EventStatus[] = ['confirmed', 'hold', 'cancelled', 'planned'];

function parseEventStatus(value: string | null): EventStatus {
  if (value && EVENT_STATUS_VALUES.includes(value as EventStatus)) {
    return value as EventStatus;
  }
  return 'planned';
}

interface EventRow {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  status: string | null;
  location_name: string | null;
  workspace_id: string;
  projects?: { id: string; name: string } | { id: string; name: string }[] | null;
}

function projectFromRow(row: EventRow): { id: string | null; name: string | null } {
  const p = row.projects;
  if (!p) return { id: null, name: null };
  const single = Array.isArray(p) ? p[0] : p;
  return { id: single?.id ?? null, name: single?.name ?? null };
}

/**
 * Fetches full event dossier by id (join projects).
 * Uses unified events table only.
 */
export async function getEventDetails(eventId: string): Promise<EventDetailDTO | null> {
  const supabase = await createClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return null;
  }

  const { data: membership } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle();

  const workspaceId = membership?.workspace_id ?? null;
  if (!workspaceId) return null;

  const { data: row, error } = await supabase
    .from('events')
    .select(`
      id,
      title,
      starts_at,
      ends_at,
      status,
      location_name,
      workspace_id,
      projects(id, name)
    `)
    .eq('id', eventId)
    .eq('workspace_id', workspaceId)
    .maybeSingle();

  if (error || !row) {
    if (error) console.error('[calendar] getEventDetails error:', error.message);
    return null;
  }

  const r = row as unknown as EventRow & { crew_count?: number; guest_count?: number; lead_contact?: string | null };
  const status = parseEventStatus(r.status);
  const project = projectFromRow(r as EventRow);

  const dto: EventDetailDTO = {
    id: String(r.id),
    title: r.title ?? '',
    start: r.starts_at ?? new Date().toISOString(),
    end: r.ends_at ?? r.starts_at ?? new Date().toISOString(),
    status,
    projectTitle: project.name ?? null,
    projectId: project.id ?? null,
    location: r.location_name ?? null,
    color: getEventColor(status),
    workspaceId: r.workspace_id ?? '',
    gigId: null,
    crewCount: typeof r.crew_count === 'number' ? r.crew_count : 0,
    guestCount: typeof r.guest_count === 'number' ? r.guest_count : 0,
    leadContact: r.lead_contact ?? null,
    timelineStatus: null,
  };

  return dto;
}
