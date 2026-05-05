/**
 * crew-hub.ts — thin barrel.
 *
 * Implementations live in ./crew-hub/* siblings (Phase 0.5-style split,
 * 2026-04-29). Callers historically imported everything from
 * './crew-hub' so this file re-exports the full surface to preserve
 * backward compat.
 *
 * NOT a `'use server'` file — Next.js requires every export from a
 * 'use server' module to be a directly-defined async function, which forbids
 * `export { x } from './sib'` re-exports. The siblings carry `'use server'`,
 * so the actions are still server actions when imported through this barrel.
 *
 * Splits:
 *   - types.ts        — shared types + Zod-friendly constants.
 *   - comms-log.ts    — comms-log reads + manual entries + crew notes.
 *   - gear.ts         — supplied gear, owned-kit, bring-to-event.
 *   - transitions.ts  — LASSO state-machine moves (replaceCrewMember).
 *   - waypoints.ts    — per-person waypoint CRUD.
 */

export type {
  CrewCommsLogEntry,
  CueAssignment,
  WaypointKind,
  CrewWaypoint,
  CrewOwnedKit,
} from './crew-hub/types';

export {
  getCrewCommsLog,
  getCueScheduleForCrew,
  updateCrewNotes,
  logCrewPhoneCall,
} from './crew-hub/comms-log';

export {
  getCrewSuppliedGear,
  getCrewOwnedKit,
  bringKitItemsToEvent,
} from './crew-hub/gear';

export { replaceCrewMember } from './crew-hub/transitions';

export {
  listCrewWaypoints,
  addCrewWaypoint,
  updateCrewWaypoint,
  removeCrewWaypoint,
} from './crew-hub/waypoints';
