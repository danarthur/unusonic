/**
 * The strip could say when someone was last out, and not when they are next.
 *
 * "Next" is the question actually asked before picking up the phone, and the
 * band decides it: booked means signed and still ahead. A proposal in play is
 * not a show you have, and promising one would be exactly the confident wrong
 * statement a computed strip exists to avoid.
 */

import { describe, it, expect } from 'vitest';
import type { EntityProduction } from '../entity-productions-shape';

/** Mirrors the selection in getPromotedMetrics: newest-first, so soonest is last. */
function nextBookedOf(productions: Pick<EntityProduction, 'band' | 'date' | 'title'>[]) {
  const booked = productions.filter((p) => p.band === 'booked' && p.date);
  return booked.length > 0 ? booked[booked.length - 1] : null;
}

const show = (
  title: string,
  date: string | null,
  band: EntityProduction['band'],
) => ({ title, date, band });

describe('next show selection', () => {
  it('takes the soonest booked show, not the furthest', () => {
    // The reader sorts newest first, so the soonest ahead is the last of them.
    const next = nextBookedOf([
      show('Winter gala', '2026-12-01', 'booked'),
      show('Ramsey wedding', '2026-10-04', 'booked'),
    ]);
    expect(next?.title).toBe('Ramsey wedding');
  });

  it('ignores a proposal that is still in play', () => {
    expect(nextBookedOf([show('Maybe wedding', '2026-10-04', 'in_play')])).toBeNull();
  });

  it('ignores shows already worked', () => {
    expect(nextBookedOf([show('Hale wedding', '2026-06-18', 'past')])).toBeNull();
  });

  it('ignores a booked show with no date', () => {
    expect(nextBookedOf([show('Undated', null, 'booked')])).toBeNull();
  });

  it('has nothing to say when nothing is booked', () => {
    expect(nextBookedOf([])).toBeNull();
  });
});
