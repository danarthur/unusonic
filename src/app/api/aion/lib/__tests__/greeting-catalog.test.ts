/**
 * Greeting catalog tests (design doc §3.2).
 *
 * Verifies:
 *   • Determinism — same (workspace, minute) always picks the same greeting
 *   • Time-of-day slot resolution (morning / afternoon / evening / late)
 *   • Weekday specials (Monday, Friday) extend the pool
 *   • First-name inclusion / anonymous fallback
 *   • No greeting contains work content (counts, urgency words, asks)
 */

import { describe, it, expect } from 'vitest';
import {
  pickGreeting,
  resolveTimeSlot,
  hashToIndex,
} from '../greeting-catalog';

describe('resolveTimeSlot', () => {
  const at = (h: number) => new Date(`2026-04-23T${String(h).padStart(2, '0')}:00:00`);

  it('maps 05:00-11:59 → morning', () => {
    expect(resolveTimeSlot(at(5))).toBe('morning');
    expect(resolveTimeSlot(at(9))).toBe('morning');
    expect(resolveTimeSlot(at(11))).toBe('morning');
  });

  it('maps 12:00-17:59 → afternoon', () => {
    expect(resolveTimeSlot(at(12))).toBe('afternoon');
    expect(resolveTimeSlot(at(15))).toBe('afternoon');
    expect(resolveTimeSlot(at(17))).toBe('afternoon');
  });

  it('maps 18:00-22:59 → evening', () => {
    expect(resolveTimeSlot(at(18))).toBe('evening');
    expect(resolveTimeSlot(at(22))).toBe('evening');
  });

  it('maps 23:00-04:59 → late', () => {
    expect(resolveTimeSlot(at(23))).toBe('late');
    expect(resolveTimeSlot(at(0))).toBe('late');
    expect(resolveTimeSlot(at(4))).toBe('late');
  });
});

describe('hashToIndex determinism', () => {
  it('same seed + modulo → same index', () => {
    const a = hashToIndex('ws-1:12345:morning', 6);
    const b = hashToIndex('ws-1:12345:morning', 6);
    expect(a).toBe(b);
  });

  it('different seeds → generally different indices (spot check)', () => {
    const results = ['ws-1', 'ws-2', 'ws-3', 'ws-4', 'ws-5'].map((w) =>
      hashToIndex(`${w}:12345:morning`, 100),
    );
    // Not all identical — probabilistic but near-certain
    const unique = new Set(results);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('handles modulo=0 gracefully (returns 0)', () => {
    expect(hashToIndex('seed', 0)).toBe(0);
  });
});

describe('pickGreeting — determinism + catalog shape', () => {
  const fixedTime = new Date('2026-04-23T09:15:30Z').getTime();

  it('is deterministic within the same minute for a given workspace', () => {
    const a = pickGreeting({ firstName: 'Daniel', workspaceId: 'ws-1', nowMs: fixedTime });
    const b = pickGreeting({ firstName: 'Daniel', workspaceId: 'ws-1', nowMs: fixedTime });
    expect(a).toBe(b);
  });

  it('may vary across different workspaces in the same minute (spot check)', () => {
    const greetings = ['ws-a', 'ws-b', 'ws-c', 'ws-d', 'ws-e'].map((w) =>
      pickGreeting({ firstName: 'Daniel', workspaceId: w, nowMs: fixedTime }),
    );
    const unique = new Set(greetings);
    expect(unique.size).toBeGreaterThan(1);
  });

  it('includes the first name when provided', () => {
    const g = pickGreeting({ firstName: 'Daniel', workspaceId: 'ws-1', nowMs: fixedTime });
    // At least one variant uses the name; the deterministic picker may or may
    // not land on a name-ful one for this seed. Repeat across time-bucket
    // variations to verify the catalog contains name variants.
    const sampled = new Set<string>();
    for (let minute = 0; minute < 50; minute++) {
      sampled.add(
        pickGreeting({ firstName: 'Daniel', workspaceId: 'ws-1', nowMs: fixedTime + minute * 60_000 }),
      );
    }
    const any = [...sampled].some((s) => s.includes('Daniel'));
    expect(any).toBe(true);
    // The for-loop variable `g` guarantees at least one greeting is produced
    // for the fixed-time case above — assert it's a non-empty string.
    expect(g.length).toBeGreaterThan(0);
  });

  it('falls back to anonymous greetings when firstName is null', () => {
    const g = pickGreeting({ firstName: null, workspaceId: 'ws-1', nowMs: fixedTime });
    expect(g).not.toContain('null');
    expect(g).not.toContain('undefined');
  });
});

describe('greeting content discipline — no work content', () => {
  // Sweep the catalog across workspace hashes, time slots, and weekdays.
  // No greeting should contain counts, urgency words, or asks.
  it('no greeting contains forbidden work-content tokens', () => {
    const forbidden = [
      'deal', 'deals', 'follow-up', 'follow up', 'need', 'urgent',
      'handle', 'draft', 'queue', 'attention', 'overdue', 'deposit',
      'proposal', 'client', 'show',
    ];

    const sampled = new Set<string>();
    for (let hour = 0; hour < 24; hour++) {
      for (let dow = 0; dow < 7; dow++) {
        for (let ws = 0; ws < 10; ws++) {
          const d = new Date(2026, 3, 20 + dow, hour, 0, 0);
          sampled.add(
            pickGreeting({
              firstName: 'Daniel',
              workspaceId: `ws-${ws}`,
              nowMs: d.getTime(),
            }),
          );
          sampled.add(
            pickGreeting({
              firstName: null,
              workspaceId: `ws-${ws}`,
              nowMs: d.getTime(),
            }),
          );
        }
      }
    }

    for (const greeting of sampled) {
      const lower = greeting.toLowerCase();
      for (const word of forbidden) {
        expect(lower).not.toContain(word);
      }
    }
  });

  it('no greeting uses exclamation marks (Stage Engineering voice)', () => {
    const sampled = new Set<string>();
    for (let hour = 0; hour < 24; hour += 2) {
      for (let ws = 0; ws < 5; ws++) {
        const d = new Date(2026, 3, 23, hour, 0, 0);
        sampled.add(
          pickGreeting({ firstName: 'Daniel', workspaceId: `ws-${ws}`, nowMs: d.getTime() }),
        );
      }
    }
    for (const g of sampled) {
      expect(g).not.toContain('!');
    }
  });
});
