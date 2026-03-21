/**
 * SignalPay – Transaction Fee Calculation
 * @module entities/billing/utils/calc
 */

/** SignalPay fee basis: 2.9% + $0.30 per transaction. */
export const TRANSACTION_FEE_BASIS = {
  rate: 0.029,
  fixed: 0.30,
} as const;

/**
 * Calculate SignalPay fee for a given amount (USD).
 */
export function calcSignalPayFee(amountUsd: number): number {
  return amountUsd * TRANSACTION_FEE_BASIS.rate + TRANSACTION_FEE_BASIS.fixed;
}

/**
 * Calculate net amount after SignalPay fee.
 */
export function calcNetAfterSignalPay(amountUsd: number): number {
  return amountUsd - calcSignalPayFee(amountUsd);
}
