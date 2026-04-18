/** Role enum for deal_stakeholders. Shared with server actions. */
export type DealStakeholderRole =
  | 'bill_to'
  | 'planner'
  | 'venue_contact'
  | 'vendor'
  | 'host'
  | 'day_of_poc'
  | 'booker'
  | 'principal'
  | 'representative';

const ROLE_LABEL: Record<DealStakeholderRole, string> = {
  bill_to: 'Bill-to',
  planner: 'Planner',
  venue_contact: 'Venue',
  vendor: 'Vendor',
  host: 'Host',
  day_of_poc: 'Point of contact',
  booker: 'Booker',
  principal: 'Principal',
  representative: 'Representative',
};

export function getStakeholderRoleLabel(role: DealStakeholderRole): string {
  return ROLE_LABEL[role];
}
