/**
 * Unit tests for calculateDepositTotal and calculateDepositCents.
 */
import { describe, it, expect } from 'vitest';
import {
  calculateDepositTotal,
  calculateDepositCents,
  type DepositLineItem,
} from '../calculate-deposit';

const row = (overrides: Partial<DepositLineItem> = {}): DepositLineItem => ({
  id: 'item-1',
  quantity: 1,
  unit_price: 100,
  override_price: null,
  unit_multiplier: null,
  is_optional: null,
  is_client_visible: null,
  ...overrides,
});

describe('calculateDepositTotal', () => {
  const noSelections = new Map<string, boolean>();

  it('sums all visible non-optional items', () => {
    expect(
      calculateDepositTotal(
        [row({ id: 'a', unit_price: 100 }), row({ id: 'b', unit_price: 200 })],
        noSelections,
      )
    ).toBe(300);
  });

  it('excludes internal-only items (is_client_visible: false)', () => {
    expect(
      calculateDepositTotal(
        [row({ unit_price: 100 }), row({ id: 'hidden', unit_price: 500, is_client_visible: false })],
        noSelections,
      )
    ).toBe(100);
  });

  it('optional item with no selection entry defaults to included', () => {
    expect(
      calculateDepositTotal([row({ is_optional: true, unit_price: 50 })], noSelections)
    ).toBe(50);
  });

  it('optional item explicitly deselected is excluded', () => {
    const selections = new Map([['item-1', false]]);
    expect(
      calculateDepositTotal([row({ is_optional: true, unit_price: 50 })], selections)
    ).toBe(0);
  });

  it('optional item explicitly selected is included', () => {
    const selections = new Map([['item-1', true]]);
    expect(
      calculateDepositTotal([row({ is_optional: true, unit_price: 75 })], selections)
    ).toBe(75);
  });

  it('non-optional item always included regardless of selections', () => {
    const selections = new Map([['item-1', false]]);
    expect(
      calculateDepositTotal([row({ is_optional: false, unit_price: 200 })], selections)
    ).toBe(200);
  });

  it('uses override_price when set', () => {
    expect(
      calculateDepositTotal([row({ unit_price: 100, override_price: 80 })], noSelections)
    ).toBe(80);
  });

  it('applies unit_multiplier', () => {
    expect(
      calculateDepositTotal([row({ unit_price: 100, unit_multiplier: 3, quantity: 2 })], noSelections)
    ).toBe(600); // 2 * 3 * 100
  });

  it('null multiplier defaults to 1', () => {
    expect(
      calculateDepositTotal([row({ unit_price: 100, unit_multiplier: null })], noSelections)
    ).toBe(100);
  });

  it('multiplier 0 falls back to 1', () => {
    expect(
      calculateDepositTotal([row({ unit_price: 100, unit_multiplier: 0 })], noSelections)
    ).toBe(100);
  });

  it('null quantity defaults to 1', () => {
    expect(
      calculateDepositTotal([row({ unit_price: 50, quantity: null })], noSelections)
    ).toBe(50);
  });

  it('empty items returns 0', () => {
    expect(calculateDepositTotal([], noSelections)).toBe(0);
  });
});

describe('calculateDepositCents', () => {
  it('25% of $1000 = 25000 cents', () => {
    expect(calculateDepositCents(1000, 25)).toBe(25000);
  });

  it('rounds to nearest 100 cents ($1)', () => {
    // 33% of $100 = $33 => 3300 cents, rounded to nearest 100 = 3300
    expect(calculateDepositCents(100, 33)).toBe(3300);
  });

  it('50% of $100.50: Math.round(50.25)*100 = 5000', () => {
    expect(calculateDepositCents(100.5, 50)).toBe(5000);
  });

  it('zero total returns 0', () => {
    expect(calculateDepositCents(0, 50)).toBe(0);
  });

  it('100% of $1 = 100 cents', () => {
    expect(calculateDepositCents(1, 100)).toBe(100);
  });
});
