/**
 * UnusonicPay – Transaction Fee Calculation
 * @module entities/billing/utils/calc
 */

/** UnusonicPay fee basis: 2.9% + $0.30 per transaction. */
export const TRANSACTION_FEE_BASIS = {
  rate: 0.029,
  fixed: 0.30,
} as const;

/**
 * Calculate UnusonicPay fee for a given amount (USD).
 */
export function calcUnusonicPayFee(amountUsd: number): number {
  return amountUsd * TRANSACTION_FEE_BASIS.rate + TRANSACTION_FEE_BASIS.fixed;
}

/**
 * Calculate net amount after UnusonicPay fee.
 */
export function calcNetAfterUnusonicPay(amountUsd: number): number {
  return amountUsd - calcUnusonicPayFee(amountUsd);
}
