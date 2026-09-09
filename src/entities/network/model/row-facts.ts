/**
 * Which fact columns a list of rows carries.
 *
 * Decided for the whole list, never per row. Material's rule for list items is
 * that content may run ragged between items but POSITION may not -- the rate
 * has to sit in the same place on every row, or in no place at all. Choosing
 * columns per node broke that: a vendors section holding both people and
 * companies rendered a Rate column on some rows and not others, so the columns
 * shifted as the eye went down.
 *
 * The set is the union of what the entities present can say. A section of only
 * venues therefore still carries no Rate column, which is the dead space this
 * was meant to remove; a mixed section carries it on every row, blank where an
 * entity has none.
 *
 * @module entities/network/model/row-facts
 */

import { shapeOf } from './card-slots';
import type { NetworkNode } from './types';

export type RowFact = 'next' | 'lastShow' | 'rate' | 'money';

/** Fixed render order, so the union below never changes the column order. */
const FACT_ORDER: RowFact[] = ['rate', 'lastShow', 'next', 'money'];

/**
 * A venue has no rate and never owes us anything. A company can owe but is not
 * booked at a day rate. Only people carry both.
 */
const FACTS_BY_SHAPE: Record<'person' | 'company' | 'venue', RowFact[]> = {
  person: ['next', 'lastShow', 'rate', 'money'],
  company: ['next', 'lastShow', 'money'],
  venue: ['next', 'lastShow'],
};

export function rowFactsFor(nodes: NetworkNode[]): RowFact[] {
  const present = new Set<RowFact>();
  for (const node of nodes) {
    for (const fact of FACTS_BY_SHAPE[shapeOf(node)]) present.add(fact);
    if (present.size === FACT_ORDER.length) break;
  }
  return FACT_ORDER.filter((f) => present.has(f));
}
