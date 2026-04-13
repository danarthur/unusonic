import { describe, it, expect } from 'vitest';
import { pickRelevantEvent } from '../pick-relevant-event';

const NOW = new Date('2026-06-01T12:00:00Z');

function ev(id: string, starts: string | null, ends: string | null) {
  return { id, starts_at: starts, ends_at: ends };
}

describe('pickRelevantEvent', () => {
  it('returns null for an empty list', () => {
    expect(pickRelevantEvent([], NOW)).toBe(null);
  });

  it('picks the soonest upcoming event when multiple are in the future', () => {
    const events = [
      ev('later',  '2026-09-01T18:00:00Z', '2026-09-01T23:00:00Z'),
      ev('soonest','2026-06-15T18:00:00Z', '2026-06-15T23:00:00Z'),
      ev('middle', '2026-07-01T18:00:00Z', '2026-07-01T23:00:00Z'),
    ];
    expect(pickRelevantEvent(events, NOW)?.id).toBe('soonest');
  });

  it('includes an event whose starts_at is past but ends_at is still in the future', () => {
    const events = [
      ev('ongoing','2026-05-31T22:00:00Z', '2026-06-02T02:00:00Z'), // overnight show
      ev('future', '2026-09-01T18:00:00Z', '2026-09-01T23:00:00Z'),
    ];
    expect(pickRelevantEvent(events, NOW)?.id).toBe('ongoing');
  });

  it('falls back to the most recent past event when nothing is upcoming', () => {
    const events = [
      ev('oldest', '2026-01-01T18:00:00Z', '2026-01-01T23:00:00Z'),
      ev('newest', '2026-05-15T18:00:00Z', '2026-05-15T23:00:00Z'),
      ev('middle', '2026-03-15T18:00:00Z', '2026-03-15T23:00:00Z'),
    ];
    expect(pickRelevantEvent(events, NOW)?.id).toBe('newest');
  });

  it('returns the first element when nothing has ends_at (edge fallback)', () => {
    const events = [
      ev('a', null, null),
      ev('b', '2026-06-15T18:00:00Z', null),
    ];
    expect(pickRelevantEvent(events, NOW)?.id).toBe('a');
  });

  it('preserves the input row type (generic carries caller fields)', () => {
    type Row = { id: string; starts_at: string; ends_at: string; title: string };
    const events: Row[] = [
      { id: 'a', starts_at: '2026-06-15T18:00:00Z', ends_at: '2026-06-15T23:00:00Z', title: 'Madison Wedding' },
    ];
    const picked = pickRelevantEvent(events, NOW);
    // Type assertion — the generic should keep `title` visible without a widening cast.
    expect(picked?.title).toBe('Madison Wedding');
  });
});
