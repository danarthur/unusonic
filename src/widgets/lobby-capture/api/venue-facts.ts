/**
 * How a spoken venue fact meets what is already on file.
 *
 * A plain module, not part of the server action: a 'use server' file may only
 * export async functions, and these are the parts worth asserting on directly.
 *
 * @module widgets/lobby-capture/api/venue-facts
 */

export function normaliseFact(spoken: unknown): unknown {
  return typeof spoken === 'string' ? spoken.trim() : spoken;
}

/**
 * What to do with one spoken venue fact.
 *
 *   fill    -- nothing on file, so record it and date it
 *   confirm -- it matches what is on file, so only the date moves
 *   skip    -- nothing was said, or what was said contradicts the record
 *
 * A contradiction is deliberately not written. Sending someone to the wrong
 * dock on a misheard sentence is worse than missing an update, so changing a
 * spec stays a deliberate edit.
 */
export function decideVenueFact(spoken: unknown, existing: unknown): 'fill' | 'confirm' | 'skip' {
  if (spoken === null || spoken === undefined) return 'skip';
  const value = normaliseFact(spoken);
  if (value === '') return 'skip';

  if (existing === null || existing === undefined || existing === '') return 'fill';
  return existing === value ? 'confirm' : 'skip';
}
