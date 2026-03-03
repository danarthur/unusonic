/**
 * Calendar feature - Server Action: fetch events in range
 * Fetches from ops.events (joined with projects for workspace scoping).
 * Overlap: (start_at <= rangeEnd) AND (end_at >= rangeStart).
 * @module features/calendar/api/get-events
 */

import 'server-only';

import { createClient } from '@/shared/api/supabase/server';
import { getCalendarEventsInputSchema } from '../model/schema';
import type { CalendarEvent } from '../model/types';
import { getEventColor } from '../model/types';

export type GetCalendarEventsInput = import('../model/schema').GetCalendarEventsInputSchema;

// =============================================================================
// Raw row from ops.events + joined ops.projects
// =============================================================================

interface OpsEventsRow {
  id: string;
  title: string | null;
  starts_at: string;
  ends_at: string;
  project?: { workspace_id: string; name: string } | null;
  projects?: { workspace_id: string; name: string } | { workspace_id: string; name: string }[] | null;
}

function projectFromRow(row: OpsEventsRow): { workspace_id: string; name: string } | null {
  const p = row.projects ?? row.project;
  if (!p) return null;
  if (Array.isArray(p)) return p[0] ?? null;
  return p;
}

function toCalendarEvent(row: OpsEventsRow): CalendarEvent | null {
  const project = projectFromRow(row);
  if (!project) return null;
  const start = row.starts_at ?? new Date().toISOString();
  const end = row.ends_at ?? start;
  return {
    id: String(row.id ?? ''),
    title: row.title ?? '',
    start,
    end,
    status: 'planned',
    projectTitle: project.name ?? null,
    location: null,
    color: getEventColor('planned'),
    workspaceId: project.workspace_id ?? '',
    gigId: null,
    clientName: null,
  };
}

// =============================================================================
// Server Action
// =============================================================================

/**
 * Fetches calendar events overlapping the given range.
 * Fetches from ops.events (joined with ops.projects for workspace scoping).
 * Security: workspace_id enforced via project join; RLS must scope by workspace.
 */
export async function getCalendarEvents(
  input: GetCalendarEventsInput
): Promise<CalendarEvent[]> {
  try {
    const parsed = getCalendarEventsInputSchema.safeParse(input);
    if (!parsed.success) {
      console.error('[calendar] getCalendarEvents validation:', parsed.error.flatten());
      return [];
    }
    const { start, end, workspaceId } = parsed.data;

    const supabase = await createClient();

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return [];
    }

    const { data: eventRowsRaw, error } = await supabase
      .schema('ops')
      .from('events')
      .select('id, title, starts_at, ends_at, project:projects!inner(workspace_id, name)')
      .eq('projects.workspace_id', workspaceId)
      .lte('starts_at', end)
      .gte('ends_at', start)
      .order('starts_at', { ascending: true })
      .limit(5000);

    if (error) {
      console.error('[calendar] getCalendarEvents events error:', error.message);
      return [];
    }

    const result: CalendarEvent[] = (eventRowsRaw ?? [])
      .map((r) => toCalendarEvent(r as unknown as OpsEventsRow))
      .filter((e): e is CalendarEvent => e !== null);

    result.sort((a, b) => a.start.localeCompare(b.start));
    return result;
  } catch (err) {
    console.error('[calendar] getCalendarEvents unexpected error:', err);
    return [];
  }
}
