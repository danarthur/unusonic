/**
 * Pure calculation for proposal line-item totals.
 * Extracted from get-public-proposal.ts for testability.
 * @module features/sales/lib/calculate-proposal-total
 */

export interface ProposalLineItem {
  clientSelected: boolean;
  unit_price?: number | null;
  override_price?: number | null;
  unit_type?: string | null;
  unit_multiplier?: number | null;
  quantity?: number | null;
}

export function calculateProposalTotal(items: ProposalLineItem[]): number {
  return items.reduce((sum, row) => {
    if (!row.clientSelected) return sum;
    const price = parseFloat(String(row.override_price ?? row.unit_price ?? 0));
    const unitType = row.unit_type;
    const multiplier = (unitType === 'hour' || unitType === 'day')
      ? (Number(row.unit_multiplier ?? 1) || 1)
      : 1;
    return sum + (row.quantity ?? 1) * multiplier * price;
  }, 0);
}
