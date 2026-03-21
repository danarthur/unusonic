/**
 * Week view layout: vertical stack for overlapping events (no horizontal fan).
 * Collision groups become full-width lanes stacked with a gap; readable and premium.
 * @module features/calendar/lib/layout
 */

import { getTime } from 'date-fns';
import type { CalendarEvent, EventStatus } from '@/features/calendar/model/types';

/** Gap between stacked overlapping events (% of slot). */
const STACK_GAP_PCT = 1.5;

/** Priority for "never collapse": lower index = higher priority (show first). */
const PRIORITY_ORDER: EventStatus[] = ['confirmed', 'hold', 'planned', 'cancelled'];

function priorityRank(status: EventStatus): number {
  const i = PRIORITY_ORDER.indexOf(status);
  return i === -1 ? 99 : i;
}

function eventTimeRange(e: CalendarEvent): { start: number; end: number } {
  return {
    start: new Date(e.start).getTime(),
    end: new Date(e.end).getTime(),
  };
}

function eventsOverlap(a: CalendarEvent, b: CalendarEvent): boolean {
  const ar = eventTimeRange(a);
  const br = eventTimeRange(b);
  return ar.start < br.end && br.start < ar.end;
}

/** Build collision groups: each group is a set of events that overlap (transitively). */
function buildCollisionGroups(events: CalendarEvent[]): CalendarEvent[][] {
  if (events.length === 0) return [];
  const sorted = [...events].sort(
    (a, b) =>
      new Date(a.start).getTime() - new Date(b.start).getTime() ||
      new Date(b.end).getTime() - new Date(a.end).getTime()
  );
  const groups: CalendarEvent[][] = [];
  let current: CalendarEvent[] = [];
  let lastEnd = 0;

  for (const e of sorted) {
    const start = new Date(e.start).getTime();
    const end = new Date(e.end).getTime();
    if (current.length === 0 || start < lastEnd) {
      current.push(e);
      lastEnd = Math.max(lastEnd, end);
    } else {
      if (current.length > 0) groups.push(current);
      current = [e];
      lastEnd = end;
    }
  }
  if (current.length > 0) groups.push(current);
  return groups;
}

/**
 * Compute top (%) and height (%) for an event in the given time window.
 */
function timeToPosition(
  windowStart: Date,
  windowEnd: Date,
  eventStart: number,
  eventEnd: number
): { top: number; height: number } {
  const winStart = getTime(windowStart);
  const winEnd = getTime(windowEnd);
  const range = winEnd - winStart;
  const start = Math.max(eventStart, winStart);
  const end = Math.min(eventEnd, winEnd);
  const top = ((start - winStart) / range) * 100;
  const height = ((end - start) / range) * 100;
  return {
    top: Math.max(0, Math.min(100, top)),
    height: Math.max(0, Math.min(100 - top, height)),
  };
}

export interface EventPosition {
  event: CalendarEvent;
  top: number;
  height: number;
  left: number;
  width: number;
}

export interface CollapsedSummary {
  events: CalendarEvent[];
  top: number;
  height: number;
}

export interface CalculateEventPositionsOptions {
  /** Max events to show in a collision group before collapsing the rest. Default 5. */
  maxVisibleInGroup?: number;
}

export interface CalculateEventPositionsResult {
  positioned: EventPosition[];
  collapsed: CollapsedSummary[];
}

/**
 * Vertical stack layout: overlapping events become full-width lanes stacked with a gap.
 * Single event in a group keeps its true time range; 2+ events share the group band and stack.
 * If a group has more than maxVisibleInGroup events, collapse the rest into a bar.
 */
export function calculateEventPositions(
  events: CalendarEvent[],
  windowStart: Date,
  windowEnd: Date,
  options: CalculateEventPositionsOptions = {}
): CalculateEventPositionsResult {
  const { maxVisibleInGroup = 6 } = options;
  const positioned: EventPosition[] = [];
  const collapsed: CollapsedSummary[] = [];

  const groups = buildCollisionGroups(events);

  for (const group of groups) {
    const byPriority = [...group].sort(
      (a, b) => priorityRank(a.status) - priorityRank(b.status)
    );
    const visible = byPriority.slice(0, maxVisibleInGroup);
    const toCollapse = byPriority.slice(maxVisibleInGroup);
    const N = visible.length;

    if (N <= 1) {
      for (const event of visible) {
        const { start, end } = eventTimeRange(event);
        const { top, height } = timeToPosition(windowStart, windowEnd, start, end);
        positioned.push({ event, top, height, left: 0, width: 100 });
      }
    } else {
      const groupStart = Math.min(...visible.map((e) => eventTimeRange(e).start));
      const groupEnd = Math.max(...visible.map((e) => eventTimeRange(e).end));
      const { top: groupTop, height: groupHeight } = timeToPosition(
        windowStart,
        windowEnd,
        groupStart,
        groupEnd
      );
      const gap = STACK_GAP_PCT;
      const laneHeight = (groupHeight - (N - 1) * gap) / N;

      for (let i = 0; i < N; i++) {
        const event = visible[i];
        const top = groupTop + i * (laneHeight + gap);
        const height = laneHeight;
        positioned.push({ event, top, height, left: 0, width: 100 });
      }
    }

    if (toCollapse.length > 0) {
      const startMin = Math.min(...toCollapse.map((e) => eventTimeRange(e).start));
      const endMax = Math.max(...toCollapse.map((e) => eventTimeRange(e).end));
      const { top, height } = timeToPosition(windowStart, windowEnd, startMin, endMax);
      collapsed.push({ events: toCollapse, top, height });
    }
  }

  return { positioned, collapsed };
}
