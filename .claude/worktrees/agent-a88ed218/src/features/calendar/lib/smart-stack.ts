/**
 * Smart Stacking for week view: Standard mode (1–2 events) vs Stack mode (3+).
 * Prioritizes text readability; Stack mode = mini-list inside the grid.
 * Timing: windowStart/windowEnd are in local time (e.g. 6 AM–2 AM next day);
 * event.start/event.end are ISO strings — positioning uses getTime() for accurate placement.
 * @module features/calendar/lib/smart-stack
 */

import { getTime, format } from 'date-fns';
import type { CalendarEvent, EventStatus } from '@/features/calendar/model/types';

/** Priority: lower index = higher (VIP/Confirmed first). */
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

/** Step A: Sort events by start time. */
function sortByStart(events: CalendarEvent[]): CalendarEvent[] {
  return [...events].sort(
    (a, b) =>
      new Date(a.start).getTime() - new Date(b.start).getTime() ||
      new Date(b.end).getTime() - new Date(a.end).getTime()
  );
}

/** Gap under this (ms) still merges into same group — avoids pill + stack stacked for same-gig/back-to-back. */
const ADJACENT_MS = 30 * 60 * 1000; // 30 minutes

/** Step B: Cluster overlapping or adjacent events into CollisionGroups. Same time block = one group. Exported for month view. */
export function buildCollisionGroups(events: CalendarEvent[]): CalendarEvent[][] {
  if (events.length === 0) return [];
  const sorted = sortByStart(events);
  const groups: CalendarEvent[][] = [];
  let current: CalendarEvent[] = [];
  let lastEnd = 0;

  for (const e of sorted) {
    const start = new Date(e.start).getTime();
    const end = new Date(e.end).getTime();
    if (current.length === 0 || start <= lastEnd + ADJACENT_MS) {
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

/** Stack mode: group rendered as a single container with flex-col list inside. */
export interface SmartStackGroup {
  mode: 'stack';
  top: number;
  height: number;
  events: CalendarEvent[];
  labelStart: string;
  labelEnd: string;
}

export interface CalculateSmartStackOptions {
  maxVisibleInGroup?: number;
}

export interface CalculateSmartStackResult {
  /** Single-event groups: one full-width pill. */
  standard: EventPosition[];
  /** 2+ event groups: one stack container, events listed inside (consistent when filter changes). */
  stackGroups: SmartStackGroup[];
  collapsed: CollapsedSummary[];
}

const STACK_MODE_THRESHOLD = 2;

/**
 * Step C: Per group — Standard (1 event only) or Stack (2+).
 * Using stack for 2+ keeps layout consistent when filter toggles between 2–3 statuses.
 */
export function calculateSmartStack(
  events: CalendarEvent[],
  windowStart: Date,
  windowEnd: Date,
  options: CalculateSmartStackOptions = {}
): CalculateSmartStackResult {
  const { maxVisibleInGroup = 6 } = options;
  const standard: EventPosition[] = [];
  const stackGroups: SmartStackGroup[] = [];
  const collapsed: CollapsedSummary[] = [];

  const groups = buildCollisionGroups(events);

  for (const group of groups) {
    const byPriority = [...group].sort(
      (a, b) =>
        priorityRank(a.status) - priorityRank(b.status) ||
        new Date(a.start).getTime() - new Date(b.start).getTime()
    );
    const visible = byPriority.slice(0, maxVisibleInGroup);
    const toCollapse = byPriority.slice(maxVisibleInGroup);
    const N = visible.length;

    if (toCollapse.length > 0) {
      const startMin = Math.min(...toCollapse.map((e) => eventTimeRange(e).start));
      const endMax = Math.max(...toCollapse.map((e) => eventTimeRange(e).end));
      const { top, height } = timeToPosition(windowStart, windowEnd, startMin, endMax);
      collapsed.push({ events: toCollapse, top, height });
    }

    if (N === 0) continue;

    if (N < STACK_MODE_THRESHOLD) {
      // Standard mode: 1 event only — one full-width pill
      const event = visible[0];
      const { start, end } = eventTimeRange(event);
      const { top, height } = timeToPosition(windowStart, windowEnd, start, end);
      standard.push({ event, top, height, left: 0, width: 100 });
    } else {
      // Stack mode: 2+ events — one container from earliestStart to latestEnd
      const earliestStart = Math.min(...visible.map((e) => eventTimeRange(e).start));
      const latestEnd = Math.max(...visible.map((e) => eventTimeRange(e).end));
      const { top, height } = timeToPosition(windowStart, windowEnd, earliestStart, latestEnd);
      stackGroups.push({
        mode: 'stack',
        top,
        height,
        events: visible,
        labelStart: format(new Date(earliestStart), 'h:mm a'),
        labelEnd: format(new Date(latestEnd), 'h:mm a'),
      });
    }
  }

  return { standard, stackGroups, collapsed };
}
