import type { RoleEdge } from './types';

/**
 * Which category a person belongs in, inferred from what they actually did on
 * deals — used only for people nobody explicitly filed.
 *
 * WHY THIS EXISTS
 * A person used to reach the contacts page only if someone drew a direct edge
 * to them, which sorts by data-entry accident rather than by relationship.
 * Alexa Infranca had worked TWO deals as planner and appeared nowhere, while
 * three people with zero deals each had cards. Working together is the better
 * evidence, and it maintains itself: the day someone runs their first show they
 * show up, with no one remembering to file them.
 *
 * The mapping follows who pays and who doesn't, which is the split that held
 * across the deal data: the payer is the client, the planner is not.
 */
const CLIENT_ROLES = new Set(['bill_to', 'host', 'principal']);
const VENDOR_ROLES = new Set([
  'planner',
  'venue_contact',
  'vendor',
  'booker',
  'representative',
]);

export function deriveRoleFromDealActivity(
  stakeholderRoles: string[],
  workedAsCrew: boolean,
): RoleEdge | null {
  // Paying beats everything: someone who was ever billed is a client, whatever
  // else they also did on the deal.
  if (stakeholderRoles.some((r) => CLIENT_ROLES.has(r))) return 'CLIENT';
  if (stakeholderRoles.some((r) => VENDOR_ROLES.has(r))) return 'VENDOR';

  // Booked onto the work itself -- that is the roster, by definition.
  if (workedAsCrew) return 'ROSTER_MEMBER';

  // day_of_poc / deal_poc alone say someone was a contact on the day but not
  // what they are to the business. Better to leave them uncategorised than to
  // guess -- an unsorted person is visibly unsorted, a wrongly-filed one is not.
  return null;
}
