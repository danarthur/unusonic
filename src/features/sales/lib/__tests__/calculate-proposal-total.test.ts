/**
 * Unit tests for calculateProposalTotal.
 */
import { describe, it, expect } from 'vitest';
import { calculateProposalTotal, type ProposalLineItem } from '../calculate-proposal-total';

const item = (overrides: Partial<ProposalLineItem> = {}): ProposalLineItem => ({
  clientSelected: true,
  unit_price: 100,
  override_price: null,
  unit_type: null,
  unit_multiplier: null,
  quantity: 1,
  ...overrides,
});

describe('calculateProposalTotal', () => {
  it('returns 0 for empty array', () => {
    expect(calculateProposalTotal([])).toBe(0);
  });

  it('single flat-rate item: quantity * price', () => {
    expect(calculateProposalTotal([item({ quantity: 3, unit_price: 50 })])).toBe(150);
  });

  it('override_price takes precedence over unit_price', () => {
    expect(calculateProposalTotal([item({ unit_price: 100, override_price: 75 })])).toBe(75);
  });

  it('both prices null: price = 0', () => {
    expect(calculateProposalTotal([item({ unit_price: null, override_price: null })])).toBe(0);
  });

  it('hourly item: quantity * multiplier * price', () => {
    expect(
      calculateProposalTotal([item({ unit_type: 'hour', unit_multiplier: 4, quantity: 2, unit_price: 50 })])
    ).toBe(400); // 2 * 4 * 50
  });

  it('daily item: same multiplier logic as hourly', () => {
    expect(
      calculateProposalTotal([item({ unit_type: 'day', unit_multiplier: 3, quantity: 1, unit_price: 200 })])
    ).toBe(600); // 1 * 3 * 200
  });

  it('null unit_type: multiplier always 1', () => {
    expect(
      calculateProposalTotal([item({ unit_type: null, unit_multiplier: 10, quantity: 2, unit_price: 100 })])
    ).toBe(200); // multiplier ignored when unit_type is null
  });

  it('flat-rate item ignores multiplier', () => {
    expect(
      calculateProposalTotal([item({ unit_type: 'flat', unit_multiplier: 5, quantity: 2, unit_price: 100 })])
    ).toBe(200); // multiplier not applied for non-hour/day
  });

  it('unselected item excluded', () => {
    expect(
      calculateProposalTotal([
        item({ clientSelected: false, unit_price: 999 }),
        item({ unit_price: 50 }),
      ])
    ).toBe(50);
  });

  it('null quantity defaults to 1', () => {
    expect(calculateProposalTotal([item({ quantity: null, unit_price: 80 })])).toBe(80);
  });

  it('null multiplier defaults to 1 for hourly', () => {
    expect(
      calculateProposalTotal([item({ unit_type: 'hour', unit_multiplier: null, unit_price: 60 })])
    ).toBe(60);
  });

  it('multiplier 0 falls back to 1 (|| 1 guard)', () => {
    expect(
      calculateProposalTotal([item({ unit_type: 'hour', unit_multiplier: 0, unit_price: 100 })])
    ).toBe(100); // 0 || 1 = 1
  });

  it('sums multiple items', () => {
    expect(
      calculateProposalTotal([
        item({ unit_price: 100, quantity: 2 }),
        item({ unit_price: 50, quantity: 1 }),
      ])
    ).toBe(250);
  });

  it('negative price produces negative line total', () => {
    expect(calculateProposalTotal([item({ unit_price: -50, quantity: 2 })])).toBe(-100);
  });

  it('floating point: 0.1 + 0.2 produces IEEE 754 result', () => {
    const total = calculateProposalTotal([
      item({ unit_price: 0.1, quantity: 1 }),
      item({ unit_price: 0.2, quantity: 1 }),
    ]);
    // Known IEEE 754 behavior — not exactly 0.3
    expect(total).toBeCloseTo(0.3, 10);
    expect(total).not.toBe(0.3);
  });
});
