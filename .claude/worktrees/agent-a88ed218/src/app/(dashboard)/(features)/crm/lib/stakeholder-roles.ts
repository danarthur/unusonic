/** Role enum for deal_stakeholders. Shared with server actions. */
export type DealStakeholderRole = 'bill_to' | 'planner' | 'venue_contact' | 'vendor';

const ROLE_LABEL: Record<DealStakeholderRole, string> = {
  bill_to: 'Bill-To Client',
  planner: 'Planner / Agency',
  venue_contact: 'Venue',
  vendor: 'Vendor',
};

export function getStakeholderRoleLabel(role: DealStakeholderRole): string {
  return ROLE_LABEL[role];
}
