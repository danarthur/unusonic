import { describe, it, expect } from 'vitest';
import {
  calcUnusonicPayFee,
  calcNetAfterUnusonicPay,
  TRANSACTION_FEE_BASIS,
} from '../calc';

describe('TRANSACTION_FEE_BASIS', () => {
  it('has correct rate and fixed fee', () => {
    expect(TRANSACTION_FEE_BASIS.rate).toBe(0.029);
    expect(TRANSACTION_FEE_BASIS.fixed).toBe(0.30);
  });
});

describe('calcUnusonicPayFee', () => {
  it('calculates fee for $100', () => {
    // 100 * 0.029 + 0.30 = 3.20
    expect(calcUnusonicPayFee(100)).toBeCloseTo(3.20, 2);
  });

  it('calculates fee for $0 (minimum is just the fixed fee)', () => {
    expect(calcUnusonicPayFee(0)).toBeCloseTo(0.30, 2);
  });

  it('calculates fee for $1 transaction', () => {
    // 1 * 0.029 + 0.30 = 0.329
    expect(calcUnusonicPayFee(1)).toBeCloseTo(0.329, 3);
  });

  it('calculates fee for large amount ($50,000)', () => {
    // 50000 * 0.029 + 0.30 = 1450.30
    expect(calcUnusonicPayFee(50000)).toBeCloseTo(1450.30, 2);
  });

  it('handles cents-level amounts ($9.99)', () => {
    // 9.99 * 0.029 + 0.30 = 0.58971
    expect(calcUnusonicPayFee(9.99)).toBeCloseTo(0.58971, 4);
  });

  it('handles typical proposal deposit ($2,500)', () => {
    // 2500 * 0.029 + 0.30 = 72.80
    expect(calcUnusonicPayFee(2500)).toBeCloseTo(72.80, 2);
  });
});

describe('calcNetAfterUnusonicPay', () => {
  it('returns amount minus fee for $100', () => {
    // 100 - 3.20 = 96.80
    expect(calcNetAfterUnusonicPay(100)).toBeCloseTo(96.80, 2);
  });

  it('returns negative for $0 (fee exceeds amount)', () => {
    // 0 - 0.30 = -0.30
    expect(calcNetAfterUnusonicPay(0)).toBeCloseTo(-0.30, 2);
  });

  it('is consistent with calcUnusonicPayFee', () => {
    const amount = 1234.56;
    const fee = calcUnusonicPayFee(amount);
    const net = calcNetAfterUnusonicPay(amount);
    expect(net).toBeCloseTo(amount - fee, 10);
  });

  it('handles large amounts ($50,000)', () => {
    // 50000 - 1450.30 = 48549.70
    expect(calcNetAfterUnusonicPay(50000)).toBeCloseTo(48549.70, 2);
  });
});
