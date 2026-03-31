'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

// =============================================================================
// Types
// =============================================================================

export type WeekEvent = {
  id: string;
  title: string;
  startsAt: string;
  lifecycleStatus: string;
  crewFilled: number;
  crewNeeded: number;
};

export type WeekDay = {
  date: string; // YYYY-MM-DD
  dayLabel: string; // 'Mon', 'Tue', etc.
  isToday: boolean;
  events: WeekEvent[];
  hasIssues: boolean; // true if any event has crew gaps
};

// =============================================================================
// Helpers
// =============================================================================

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const;

function toDateString(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// =============================================================================
// Server Action
// =============================================================================

export async function getWeekEvents(): Promise<WeekDay[]> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return buildEmptyWeek();

  const supabase = await createClient();

  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const weekEnd = new Date(todayStart.getTime() + 7 * 86_400_000);
  const todayStr = toDateString(todayStart);

  try {
    // Fetch events for the next 7 days
    const { data: eventRows, error: evtErr } = await supabase
      .schema('ops')
      .from('events')
      .select('id, title, starts_at, lifecycle_status, deal_id')
      .eq('workspace_id', workspaceId)
      .gte('starts_at', todayStart.toISOString())
      .lt('starts_at', weekEnd.toISOString())
      .in('lifecycle_status', ['tentative', 'confirmed', 'production', 'live'])
      .order('starts_at', { ascending: true });

    if (evtErr) {
      console.error('[dashboard] getWeekEvents:', evtErr.message);
      return buildEmptyWeek();
    }

    const rows = (eventRows ?? []) as {
      id: string;
      title: string | null;
      starts_at: string;
      lifecycle_status: string;
      deal_id: string | null;
    }[];

    // Batch fetch crew counts from ops.deal_crew
    const dealIds = [...new Set(rows.map((r) => r.deal_id).filter(Boolean) as string[])];
    const crewCountMap = new Map<string, number>();

    if (dealIds.length > 0) {
      const { data: crewRows } = await supabase
        .schema('ops')
        .from('deal_crew')
        .select('deal_id')
        .in('deal_id', dealIds);

      for (const row of (crewRows ?? []) as { deal_id: string }[]) {
        crewCountMap.set(row.deal_id, (crewCountMap.get(row.deal_id) ?? 0) + 1);
      }
    }

    // Group events by date
    const eventsByDate = new Map<string, WeekEvent[]>();

    for (const r of rows) {
      const dateStr = r.starts_at.slice(0, 10);
      const crewFilled = r.deal_id ? (crewCountMap.get(r.deal_id) ?? 0) : 0;

      const evt: WeekEvent = {
        id: r.id,
        title: r.title ?? 'Untitled event',
        startsAt: r.starts_at,
        lifecycleStatus: r.lifecycle_status,
        crewFilled,
        crewNeeded: crewFilled, // No separate requirement data yet
      };

      const existing = eventsByDate.get(dateStr);
      if (existing) {
        existing.push(evt);
      } else {
        eventsByDate.set(dateStr, [evt]);
      }
    }

    // Build the 7-day array, filling in empty days
    const week: WeekDay[] = [];
    for (let i = 0; i < 7; i++) {
      const day = new Date(todayStart.getTime() + i * 86_400_000);
      const dateStr = toDateString(day);
      const dayEvents = eventsByDate.get(dateStr) ?? [];
      const hasIssues = dayEvents.some((e) => e.crewFilled < e.crewNeeded);

      week.push({
        date: dateStr,
        dayLabel: DAY_LABELS[day.getUTCDay()],
        isToday: dateStr === todayStr,
        events: dayEvents,
        hasIssues,
      });
    }

    return week;
  } catch (err) {
    console.error('[dashboard] getWeekEvents unexpected error:', err);
    return buildEmptyWeek();
  }
}

/** Builds a 7-day array with no events (used as fallback). */
function buildEmptyWeek(): WeekDay[] {
  const now = new Date();
  const todayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const todayStr = toDateString(todayStart);

  return Array.from({ length: 7 }, (_, i) => {
    const day = new Date(todayStart.getTime() + i * 86_400_000);
    const dateStr = toDateString(day);
    return {
      date: dateStr,
      dayLabel: DAY_LABELS[day.getUTCDay()],
      isToday: dateStr === todayStr,
      events: [],
      hasIssues: false,
    };
  });
}
