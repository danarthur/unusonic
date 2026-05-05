/**
 * deal-crew.ts — thin barrel.
 *
 * Implementation lives in ./deal-crew/* siblings (Phase 0.5-style split,
 * 2026-04-29). 42+ external callers historically imported everything from
 * './deal-crew', so this file re-exports the full surface.
 *
 * NOT a `'use server'` file — Next.js requires every export from a 'use
 * server' module to be a directly-defined async function, which forbids
 * the `export { x } from './sib'` re-exports below. The siblings carry
 * `'use server'`, so the actions remain server actions when imported here.
 *
 * Splits:
 *   - types.ts            — shared type definitions
 *   - sync-from-proposal.ts — proposal→crew sync
 *   - search.ts           — searchCrewMembers + listDealRoster
 *   - main.ts             — the canonical read (getDealCrew) + manual edits
 *                           + remind-all + event-views + dispatch update
 */

export type {
  DealCrewSkill,
  DealCrewRow,
  CrewSearchResult,
} from './deal-crew/types';

export { syncCrewFromProposal } from './deal-crew/sync-from-proposal';
export { searchCrewMembers, listDealRoster } from './deal-crew/search';
export {
  getDealCrew,
  addManualDealCrew,
  confirmDealCrew,
  removeDealCrew,
  addManualOpenRole,
  assignDealCrewEntity,
  remindAllUnconfirmed,
  getDealCrewForEvent,
  getCrewGearSummary,
  getDealCrewEquipmentNames,
  updateCrewDispatch,
} from './deal-crew/main';

export type { RemindAllResult, CrewGearSummary } from './deal-crew/main';
export type { PriorityBreakdown } from './get-aion-card-for-deal';
