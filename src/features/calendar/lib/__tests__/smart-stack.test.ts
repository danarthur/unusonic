import { describe, it, expect } from 'vitest';
import { buildCollisionGroups, calculateSmartStack } from '../smart-stack';
import type { CalendarEvent } from '@/features/calendar/model/types';

function makeEvent(overrides: Partial<CalendarEvent> & { start: string; end: string }): CalendarEvent {
  return {
    id: overrides.id ?? 'evt-1',
    title: overrides.title ?? 'Test Event',
    start: overrides.start,
    end: overrides.end,
    status: overrides.status ?? 'confirmed',
    projectTitle: null,
    location: null,
    color: 'emerald',
    workspaceId: 'ws-1',
    gigId: null,
    clientName: null,
    ...overrides,
  };
}

// Window: 6 AM to 2 AM next day (20-hour window)
const windowStart = new Date('2026-04-07T06:00:00');
const windowEnd = new Date('2026-04-08T02:00:00');

describe('buildCollisionGroups', () => {
  it('returns empty array for no events', () => {
    expect(buildCollisionGroups([])).toEqual([]);
  });

  it('puts non-overlapping events in separate groups', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T08:00:00', end: '2026-04-07T10:00:00' }),
      makeEvent({ id: 'b', start: '2026-04-07T14:00:00', end: '2026-04-07T16:00:00' }),
    ];
    const groups = buildCollisionGroups(events);
    expect(groups).toHaveLength(2);
    expect(groups[0]).toHaveLength(1);
    expect(groups[1]).toHaveLength(1);
  });

  it('groups overlapping events together', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T08:00:00', end: '2026-04-07T11:00:00' }),
      makeEvent({ id: 'b', start: '2026-04-07T10:00:00', end: '2026-04-07T12:00:00' }),
    ];
    const groups = buildCollisionGroups(events);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(2);
  });

  it('merges adjacent events within 30-minute gap', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T08:00:00', end: '2026-04-07T10:00:00' }),
      makeEvent({ id: 'b', start: '2026-04-07T10:20:00', end: '2026-04-07T12:00:00' }), // 20 min gap
    ];
    const groups = buildCollisionGroups(events);
    expect(groups).toHaveLength(1);
  });

  it('separates events with gap larger than 30 minutes', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T08:00:00', end: '2026-04-07T10:00:00' }),
      makeEvent({ id: 'b', start: '2026-04-07T10:31:00', end: '2026-04-07T12:00:00' }), // 31 min gap
    ];
    const groups = buildCollisionGroups(events);
    expect(groups).toHaveLength(2);
  });

  it('sorts events by start time before grouping', () => {
    const events = [
      makeEvent({ id: 'b', start: '2026-04-07T14:00:00', end: '2026-04-07T16:00:00' }),
      makeEvent({ id: 'a', start: '2026-04-07T08:00:00', end: '2026-04-07T10:00:00' }),
    ];
    const groups = buildCollisionGroups(events);
    expect(groups).toHaveLength(2);
    expect(groups[0][0].id).toBe('a');
    expect(groups[1][0].id).toBe('b');
  });

  it('chains overlapping events into one group', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T08:00:00', end: '2026-04-07T10:00:00' }),
      makeEvent({ id: 'b', start: '2026-04-07T09:00:00', end: '2026-04-07T11:00:00' }),
      makeEvent({ id: 'c', start: '2026-04-07T10:30:00', end: '2026-04-07T12:00:00' }), // overlaps b via adjacency
    ];
    const groups = buildCollisionGroups(events);
    expect(groups).toHaveLength(1);
    expect(groups[0]).toHaveLength(3);
  });
});

describe('calculateSmartStack', () => {
  it('returns empty result for no events', () => {
    const result = calculateSmartStack([], windowStart, windowEnd);
    expect(result.standard).toEqual([]);
    expect(result.stackGroups).toEqual([]);
    expect(result.collapsed).toEqual([]);
  });

  it('puts single event in standard mode', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T10:00:00', end: '2026-04-07T12:00:00' }),
    ];
    const result = calculateSmartStack(events, windowStart, windowEnd);
    expect(result.standard).toHaveLength(1);
    expect(result.stackGroups).toHaveLength(0);
    expect(result.standard[0].event.id).toBe('a');
    expect(result.standard[0].left).toBe(0);
    expect(result.standard[0].width).toBe(100);
  });

  it('puts 2 overlapping events in stack mode', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T10:00:00', end: '2026-04-07T12:00:00' }),
      makeEvent({ id: 'b', start: '2026-04-07T11:00:00', end: '2026-04-07T13:00:00' }),
    ];
    const result = calculateSmartStack(events, windowStart, windowEnd);
    expect(result.standard).toHaveLength(0);
    expect(result.stackGroups).toHaveLength(1);
    expect(result.stackGroups[0].events).toHaveLength(2);
    expect(result.stackGroups[0].mode).toBe('stack');
  });

  it('calculates correct top/height percentages', () => {
    // Window: 6 AM to 2 AM = 20 hours = 72000000 ms
    // Event: 10 AM to 12 PM = 4h from start, 2h duration
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T10:00:00', end: '2026-04-07T12:00:00' }),
    ];
    const result = calculateSmartStack(events, windowStart, windowEnd);
    const pos = result.standard[0];
    // top = (4h / 20h) * 100 = 20%
    expect(pos.top).toBeCloseTo(20, 0);
    // height = (2h / 20h) * 100 = 10%
    expect(pos.height).toBeCloseTo(10, 0);
  });

  it('clamps events that extend beyond window', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T04:00:00', end: '2026-04-07T08:00:00' }), // starts before window
    ];
    const result = calculateSmartStack(events, windowStart, windowEnd);
    const pos = result.standard[0];
    expect(pos.top).toBe(0); // clamped to window start
    expect(pos.height).toBeGreaterThan(0);
  });

  it('collapses events beyond maxVisibleInGroup', () => {
    const events = Array.from({ length: 8 }, (_, i) =>
      makeEvent({
        id: `evt-${i}`,
        start: '2026-04-07T10:00:00',
        end: '2026-04-07T12:00:00',
        status: 'confirmed',
      }),
    );
    const result = calculateSmartStack(events, windowStart, windowEnd, { maxVisibleInGroup: 3 });
    expect(result.stackGroups[0].events).toHaveLength(3);
    expect(result.collapsed).toHaveLength(1);
    expect(result.collapsed[0].events).toHaveLength(5);
  });

  it('prioritizes confirmed events over cancelled', () => {
    const events = [
      makeEvent({ id: 'cancelled', start: '2026-04-07T10:00:00', end: '2026-04-07T12:00:00', status: 'cancelled' }),
      makeEvent({ id: 'confirmed', start: '2026-04-07T10:00:00', end: '2026-04-07T12:00:00', status: 'confirmed' }),
    ];
    const result = calculateSmartStack(events, windowStart, windowEnd);
    // In stack mode, confirmed should be first
    expect(result.stackGroups[0].events[0].id).toBe('confirmed');
  });

  it('separates non-overlapping events into independent standard pills', () => {
    const events = [
      makeEvent({ id: 'a', start: '2026-04-07T08:00:00', end: '2026-04-07T09:00:00' }),
      makeEvent({ id: 'b', start: '2026-04-07T18:00:00', end: '2026-04-07T20:00:00' }),
    ];
    const result = calculateSmartStack(events, windowStart, windowEnd);
    expect(result.standard).toHaveLength(2);
    expect(result.stackGroups).toHaveLength(0);
  });
});
