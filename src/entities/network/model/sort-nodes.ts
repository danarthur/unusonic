/**
 * Ordering the contacts page.
 *
 * There was no sort control at all, and the server order was not even
 * consistent within a section: nodes are merged as roster, then preferred
 * partners, then everyone else, each run alphabetised separately -- so a
 * vendors section rendered as two alphabetical runs back to back and read as
 * broken sorting at a glance.
 *
 * More importantly, "who have I not used in a while" was unanswerable. That is
 * a real question here, and it is the one ordering that also puts the records
 * with nothing on them at the bottom, out of the way of a scan.
 *
 * @module entities/network/model/sort-nodes
 */

import type { NetworkNode } from './types';

export type SortMode = 'recent' | 'upcoming' | 'name';

export const SORT_MODES: { id: SortMode; label: string }[] = [
  { id: 'recent', label: 'Last worked' },
  { id: 'upcoming', label: 'Next booked' },
  { id: 'name', label: 'Name' },
];

export const DEFAULT_SORT: SortMode = 'recent';

function byName(a: NetworkNode, b: NetworkNode): number {
  return a.identity.name.localeCompare(b.identity.name);
}

/**
 * Compare two optional dates, putting the ones we have first.
 *
 * A missing date is not a very old date. Someone never worked with is not the
 * same as someone last worked with in 2019, and sorting them together would
 * bury real history under records that have none.
 */
function byDate(
  a: string | null | undefined,
  b: string | null | undefined,
  direction: 'asc' | 'desc',
): number {
  if (!a && !b) return 0;
  if (!a) return 1;
  if (!b) return -1;
  return direction === 'desc' ? b.localeCompare(a) : a.localeCompare(b);
}

/**
 * A stable ordering. Name breaks every tie, so a section of entities with no
 * dates at all still reads as a sorted list rather than a shuffled one.
 */
export function sortNodes(nodes: NetworkNode[], mode: SortMode): NetworkNode[] {
  const sorted = [...nodes];

  if (mode === 'name') {
    return sorted.sort(byName);
  }

  if (mode === 'upcoming') {
    return sorted.sort(
      (a, b) => byDate(a.meta.nextBooked, b.meta.nextBooked, 'asc') || byName(a, b),
    );
  }

  return sorted.sort(
    (a, b) => byDate(a.meta.lastWorked, b.meta.lastWorked, 'desc') || byName(a, b),
  );
}
