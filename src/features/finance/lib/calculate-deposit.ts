/**
 * Pure deposit calculation logic.
 * Extracted from create-proposal-deposit-intent.ts for testability.
 * @module features/finance/lib/calculate-deposit
 */

export interface DepositLineItem {
  id: string;
  quantity: number | null;
  unit_price: number;
  override_price: number | null;
  unit_multiplier: number | null;
  is_optional: boolean | null;
  is_client_visible: boolean | null;
}

export function calculateDepositTotal(
  items: DepositLineItem[],
  selectionsMap: Map<string, boolean>,
): number {
  return items
    .filter((row) => row.is_client_visible !== false)
    .reduce((sum, row) => {
      if (row.is_optional) {
        const selected = selectionsMap.has(row.id) ? selectionsMap.get(row.id) : true;
        if (!selected) return sum;
      }
      const price = Number(row.override_price ?? row.unit_price ?? 0);
      const multiplier = Number(row.unit_multiplier ?? 1) || 1;
      return sum + (row.quantity ?? 1) * multiplier * price;
    }, 0);
}

export function calculateDepositCents(total: number, depositPercent: number): number {
  return Math.round((total * depositPercent) / 100) * 100;
}
