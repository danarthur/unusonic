/**
 * Calendar Page – Server Component
 * Reads view/date from URL, fetches range and events, passes to CalendarShell.
 * CalendarShell uses useSearchParams() so it must be inside Suspense.
 * @module app/(dashboard)/calendar/page
 */

import { Suspense } from 'react';
import { getCalendarEvents } from '@/features/calendar/api/get-events';
import { getRangeForView } from '@/features/calendar/lib/date-ranges';
import type { CalendarViewType } from '@/features/calendar/lib/date-ranges';
import { CalendarShell } from '@/features/calendar/ui/calendar-shell';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';
import { getSession } from '@/shared/lib/auth/session';

export const dynamic = 'force-dynamic';

const VIEW_PARAM = 'view';
const DATE_PARAM = 'date';
const DEFAULT_VIEW: CalendarViewType = 'month';

function parseView(value: string | null): CalendarViewType {
  if (value === 'year' || value === 'month' || value === 'week') return value;
  return DEFAULT_VIEW;
}

/** Parse YYYY-MM-DD as local noon so the calendar day is correct in all timezones. */
function parseDate(value: string | null): string {
  if (!value || value.length < 10) return new Date().toISOString().slice(0, 10);
  const d = new Date(value.slice(0, 10) + 'T12:00:00');
  return Number.isNaN(d.getTime()) ? new Date().toISOString().slice(0, 10) : value.slice(0, 10);
}

function CalendarLoading() {
  return (
    <div className="flex-1 min-h-[480px] rounded-2xl stage-panel border border-[oklch(1_0_0_/_0.08)] flex items-center justify-center">
      <p className="text-[var(--stage-text-secondary)] font-medium">Loading calendar…</p>
    </div>
  );
}

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const viewParam = typeof params[VIEW_PARAM] === 'string' ? params[VIEW_PARAM] : null;
  const dateParam = typeof params[DATE_PARAM] === 'string' ? params[DATE_PARAM] : null;

  const view = parseView(viewParam);
  const dateStr = parseDate(dateParam);

  return (
    <div className="flex-1 min-h-0 w-full p-4 md:p-6 flex flex-col">
      <Suspense fallback={<CalendarLoading />}>
        <CalendarData view={view} dateStr={dateStr} />
      </Suspense>
    </div>
  );
}

async function CalendarData({ view, dateStr }: { view: CalendarViewType; dateStr: string }) {
  try {
    const viewDate = new Date(dateStr + 'T12:00:00');
    const range = getRangeForView(viewDate, view);
    const workspaceId = (await getActiveWorkspaceId()) ?? (await getSession()).workspace.id;
    const events = workspaceId
      ? await getCalendarEvents({ start: range.start, end: range.end, workspaceId })
      : [];

    return (
      <CalendarShell
        events={events}
        initialView={view}
        initialDate={dateStr}
      />
    );
  } catch (err) {
    console.error('[Calendar] Page error:', err);
    return (
      <div className="stage-panel rounded-2xl p-8 border border-[oklch(1_0_0_/_0.08)] max-w-lg border-l-4 border-l-[var(--color-unusonic-error)]">
        <p className="text-[var(--stage-text-primary)] font-medium">Something went wrong</p>
        <p className="text-[var(--stage-text-secondary)] text-sm mt-1">
          {err instanceof Error ? err.message : 'Failed to load calendar'}
        </p>
      </div>
    );
  }
}
