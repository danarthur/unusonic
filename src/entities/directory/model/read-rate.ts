/**
 * What a person costs to book, read off their entity attributes.
 *
 * Distinct from ops.deal_crew.day_rate, which is what was agreed on one
 * booking. This is the number quoted from before a booking exists, and until
 * it had a field it lived only in the text of a note -- where it went stale
 * quietly and could not be compared against anyone else's.
 *
 * @module entities/directory/model/read-rate
 */

import { PERSON_ATTR } from './attribute-keys';

export type PersonRate = { amount: number; unit: string | null };

export function readRate(attrs: Record<string, unknown>): PersonRate | null {
  const amount = attrs[PERSON_ATTR.rate_amount];
  if (typeof amount !== 'number' || !Number.isFinite(amount) || amount <= 0) return null;

  const unit = attrs[PERSON_ATTR.rate_unit];
  return { amount, unit: typeof unit === 'string' && unit.trim() ? unit.trim() : null };
}
