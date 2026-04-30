/**
 * event-gear-items.ts — thin barrel.
 *
 * Implementation lives in ./event-gear-items/* siblings (Phase 0.5-style
 * split, 2026-04-29). Multiple components and sibling actions historically
 * imported the full surface from './event-gear-items', so this file
 * re-exports everything.
 *
 * NOT a `'use server'` file — Next.js requires every export from a 'use
 * server' module to be a directly-defined async function, which forbids the
 * `export { x } from './sib'` re-exports below. The siblings carry
 * `'use server'`, so the actions remain server actions when imported here.
 *
 * Splits:
 *   - types.ts        — shared type definitions (no runtime)
 *   - crud.ts         — getEventGearItems + add/remove/status/operator mutations
 *   - availability.ts — single + batch stock-vs-allocation arithmetic
 *   - crew-source.ts  — per-event crew-as-source flow (matches, source/unsource)
 *   - rollup.ts       — workspace-wide crew-sourced gear roll-up
 */

export type {
  GearSource,
  GearLineageSource,
  EventGearItem,
  GearAvailability,
  CrewGearMatch,
  CrewEquipmentRollupEntry,
} from './event-gear-items/types';

export {
  getEventGearItems,
  addGearItem,
  removeGearItem,
  updateGearItemStatus,
  assignGearOperator,
} from './event-gear-items/crud';

export {
  getGearAvailability,
  batchGetGearAvailability,
} from './event-gear-items/availability';

export {
  getCrewEquipmentMatchesForEvent,
  sourceGearFromCrew,
  unsourceGearFromCrew,
} from './event-gear-items/crew-source';

export { getCrewSourcedEquipmentRollup } from './event-gear-items/rollup';

export { detachGearFromPackage } from './event-gear-items/lineage';

export { getGearLineageEnabled } from './event-gear-items/lineage-flag';
