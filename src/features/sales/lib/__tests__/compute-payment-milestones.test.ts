import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computePaymentMilestones,
  type PaymentMilestoneInput,
} from '../compute-payment-milestones';

const base: PaymentMilestoneInput = {
  signedAt: null,
  acceptedAt: null,
  depositPercent: null,
  depositPaidAt: null,
  depositDeadlineDays: null,
  paymentDueDays: null,
  proposedDate: null,
  proposalTotal: null,
};

afterEach(() => {
  vi.useRealTimers();
});

function freezeAt(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('computePaymentMilestones', () => {
  // ── Empty cases ──

  it('returns empty array when no sign date and no proposed date', () => {
    expect(computePaymentMilestones(base)).toEqual([]);
  });

  it('returns only balance milestone when no deposit required', () => {
    freezeAt('2026-03-01T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-03-01T00:00:00Z',
      proposedDate: '2026-06-15',
      proposalTotal: 10000,
    });
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe('balance_due');
  });

  // ── Deposit milestone ──

  it('computes deposit due date from signedAt + deadlineDays', () => {
    freezeAt('2026-04-02T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-04-01T00:00:00Z',
      depositPercent: 50,
      depositDeadlineDays: 10,
      proposalTotal: 8000,
    });
    const deposit = result.find((m) => m.type === 'deposit_due')!;
    expect(deposit.date).toBe('2026-04-11');
    expect(deposit.amount).toBe(4000);
    expect(deposit.status).toBe('upcoming');
  });

  it('uses 7-day default when depositDeadlineDays is null', () => {
    freezeAt('2026-04-02T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-04-01T00:00:00Z',
      depositPercent: 25,
      proposalTotal: 10000,
    });
    const deposit = result.find((m) => m.type === 'deposit_due')!;
    expect(deposit.date).toBe('2026-04-08');
    expect(deposit.amount).toBe(2500);
  });

  it('marks deposit as paid when depositPaidAt is set', () => {
    freezeAt('2026-04-15T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-04-01T00:00:00Z',
      depositPercent: 50,
      depositPaidAt: '2026-04-05T00:00:00Z',
      proposalTotal: 6000,
    });
    const deposit = result.find((m) => m.type === 'deposit_due')!;
    expect(deposit.status).toBe('paid');
  });

  it('marks deposit as overdue when past deadline', () => {
    freezeAt('2026-04-20T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-04-01T00:00:00Z',
      depositPercent: 50,
      depositDeadlineDays: 7,
      proposalTotal: 6000,
    });
    const deposit = result.find((m) => m.type === 'deposit_due')!;
    expect(deposit.status).toBe('overdue');
  });

  it('marks deposit as due_soon when within 3 days of deadline', () => {
    freezeAt('2026-04-07T00:00:00Z'); // 1 day before Apr 8 deadline
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-04-01T00:00:00Z',
      depositPercent: 50,
      depositDeadlineDays: 7,
      proposalTotal: 6000,
    });
    const deposit = result.find((m) => m.type === 'deposit_due')!;
    expect(deposit.status).toBe('due_soon');
  });

  it('falls back to acceptedAt when signedAt is null', () => {
    freezeAt('2026-04-02T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      acceptedAt: '2026-04-01T00:00:00Z',
      depositPercent: 50,
      depositDeadlineDays: 5,
      proposalTotal: 4000,
    });
    const deposit = result.find((m) => m.type === 'deposit_due')!;
    expect(deposit.date).toBe('2026-04-06');
    expect(deposit.amount).toBe(2000);
  });

  // ── Balance milestone ──

  it('computes balance due date from proposedDate minus paymentDueDays', () => {
    freezeAt('2026-03-01T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-03-01T00:00:00Z',
      proposedDate: '2026-06-15',
      paymentDueDays: 14,
      proposalTotal: 10000,
    });
    const balance = result.find((m) => m.type === 'balance_due')!;
    expect(balance.date).toBe('2026-06-01');
    expect(balance.amount).toBe(10000);
    expect(balance.status).toBe('upcoming');
  });

  it('uses 14-day default when paymentDueDays is null', () => {
    freezeAt('2026-03-01T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      proposedDate: '2026-06-15',
      proposalTotal: 5000,
    });
    const balance = result.find((m) => m.type === 'balance_due')!;
    expect(balance.date).toBe('2026-06-01');
  });

  it('subtracts deposit from balance when deposit is paid', () => {
    freezeAt('2026-03-01T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-03-01T00:00:00Z',
      depositPercent: 50,
      depositPaidAt: '2026-03-05T00:00:00Z',
      proposedDate: '2026-06-15',
      proposalTotal: 10000,
    });
    const balance = result.find((m) => m.type === 'balance_due')!;
    expect(balance.amount).toBe(5000);
  });

  it('shows full amount when deposit not yet paid', () => {
    freezeAt('2026-03-01T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-03-01T00:00:00Z',
      depositPercent: 50,
      proposedDate: '2026-06-15',
      proposalTotal: 10000,
    });
    const balance = result.find((m) => m.type === 'balance_due')!;
    expect(balance.amount).toBe(10000);
  });

  it('marks balance as overdue when past due date', () => {
    freezeAt('2026-06-10T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      proposedDate: '2026-06-15',
      paymentDueDays: 14,
      proposalTotal: 5000,
    });
    const balance = result.find((m) => m.type === 'balance_due')!;
    expect(balance.status).toBe('overdue');
  });

  it('marks balance as due_soon when within 7 days', () => {
    freezeAt('2026-05-28T12:00:00Z'); // 4 days before Jun 1 due date
    const result = computePaymentMilestones({
      ...base,
      proposedDate: '2026-06-15',
      paymentDueDays: 14,
      proposalTotal: 5000,
    });
    const balance = result.find((m) => m.type === 'balance_due')!;
    expect(balance.status).toBe('due_soon');
  });

  // ── Rounding ──

  it('rounds deposit amount to nearest integer', () => {
    freezeAt('2026-04-02T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-04-01T00:00:00Z',
      depositPercent: 33,
      proposalTotal: 1000,
    });
    const deposit = result.find((m) => m.type === 'deposit_due')!;
    expect(deposit.amount).toBe(330); // Math.round(1000 * 33 / 100)
  });

  // ── Both milestones ──

  it('returns both deposit and balance milestones when applicable', () => {
    freezeAt('2026-03-01T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      signedAt: '2026-03-01T00:00:00Z',
      depositPercent: 50,
      depositDeadlineDays: 7,
      proposedDate: '2026-06-15',
      paymentDueDays: 14,
      proposalTotal: 10000,
    });
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe('deposit_due');
    expect(result[1].type).toBe('balance_due');
  });

  // ── Null total ──

  it('returns null amount for balance when total is zero', () => {
    freezeAt('2026-03-01T12:00:00Z');
    const result = computePaymentMilestones({
      ...base,
      proposedDate: '2026-06-15',
      proposalTotal: 0,
    });
    const balance = result.find((m) => m.type === 'balance_due')!;
    expect(balance.amount).toBeNull();
  });
});
