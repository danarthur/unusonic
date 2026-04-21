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

export interface ProposalCostLineItem {
  quantity?: number | null;
  actual_cost?: number | null;
  /** Unit type mirrors the catalog — 'flat', 'hour', or 'day'. Anything other
   *  than 'hour' / 'day' treats multiplier as 1. */
  unit_type?: string | null;
  /** Unit multiplier scales a per-unit actual_cost for hourly/daily items.
   *  Matches how calculateProposalTotal scales the revenue side. */
  unit_multiplier?: number | null;
  /** Bundle header rows carry the bundle-level price but their children carry
   *  the ingredient costs — summing both would double-count. get-event-ledger
   *  uses the same exclusion model. */
  is_package_header?: boolean | null;
  package_instance_id?: string | null;
}

/**
 * Total expected cost of a proposal: sum of `actual_cost × quantity × multiplier`
 * for every line item that isn't a bundle header. `actual_cost` is seeded from
 * the catalog's `target_cost` at add time by `addPackageToProposal`, so this is
 * almost always non-null for real proposals. Rows with null actual_cost are
 * treated as $0 here; callers that want to distinguish "unknown cost" from
 * "$0 cost" should check the field directly.
 *
 * The multiplier factor is symmetric with calculateProposalTotal: for an hourly
 * A1 service at $150/hr target cost × 8 hours × 1 qty, cost is $1200, not $150.
 */
export function calculateProposalCost(items: ProposalCostLineItem[]): number {
  return items.reduce((sum, row) => {
    // Bundle headers carry the bundle price on their row but cost lives on
    // the children. Skip the header to avoid double-counting.
    if (row.is_package_header && row.package_instance_id) return sum;
    const cost = row.actual_cost != null ? parseFloat(String(row.actual_cost)) : 0;
    const qty = Number(row.quantity ?? 1) || 1;
    const multiplier = (row.unit_type === 'hour' || row.unit_type === 'day')
      ? (Number(row.unit_multiplier ?? 1) || 1)
      : 1;
    return sum + cost * qty * multiplier;
  }, 0);
}
