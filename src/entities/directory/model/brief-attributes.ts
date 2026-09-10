/**
 * Which attributes an AI brief is allowed to see.
 *
 * The generator used to hand the model `Object.entries(attributes)` — every
 * key on the row, internal plumbing included. On production data that produced,
 * about a real coordinator:
 *
 *   "Brandi Jane is a ghost."   pinned fact: "ghost"
 *
 * `is_ghost` means "has not claimed an account yet". It is a flag about our
 * records, not a property of a person, and the model had no way to know that.
 * The old filter dropped falsey values, so only ghosts were ever told they were
 * ghosts — the bug was invisible on anyone who had signed up.
 *
 * So this is an allowlist, not a denylist. A denylist is a promise to remember
 * every internal field somebody adds later, and the failure mode is a sentence
 * about a customer that nobody wrote.
 *
 * Only fields a human typed about a human. Identifiers, ownership, claim state
 * and category are all absent on purpose: they are either plumbing, or they are
 * already rendered on a card an inch away.
 *
 * @module entities/directory/model/brief-attributes
 */

import { PERSON_ATTR, COMPANY_ATTR, VENUE_ATTR } from './attribute-keys';

const BRIEF_SAFE_KEYS: ReadonlySet<string> = new Set<string>([
  // Who they are and what they do.
  PERSON_ATTR.first_name,
  PERSON_ATTR.last_name,
  PERSON_ATTR.job_title,
  PERSON_ATTR.market,
  PERSON_ATTR.union_status,
  // Working preferences worth recalling before you call someone.
  PERSON_ATTR.rate_note,
  PERSON_ATTR.availability_blackouts,
  // Organisations.
  COMPANY_ATTR.website,
  // Venues: the facts that decide whether a show can happen there.
  VENUE_ATTR.capacity,
  VENUE_ATTR.load_in_window,
  VENUE_ATTR.curfew,
  VENUE_ATTR.union_local,
]);

/**
 * The subset of an entity's attributes safe to put in a prompt.
 *
 * Values are stringified by the caller. Empty and false values are dropped:
 * "cdl: false" is not something to recall, and an absent field says nothing.
 */
export function briefSafeAttributes(
  attributes: Record<string, unknown> | null | undefined,
): [string, unknown][] {
  if (!attributes) return [];
  return Object.entries(attributes).filter(
    ([key, value]) =>
      BRIEF_SAFE_KEYS.has(key) && value != null && value !== '' && value !== false,
  );
}
