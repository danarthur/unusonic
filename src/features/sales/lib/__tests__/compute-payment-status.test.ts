import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  computePaymentStatus,
  paymentStatusLabel,
  paymentStatusColor,
  type PaymentStatusInput,
} from '../compute-payment-status';

const base: PaymentStatusInput = {
  proposalStatus: null,
  signedAt: null,
  acceptedAt: null,
  depositPercent: null,
  depositPaidAt: null,
  depositDeadlineDays: null,
  paymentDueDays: null,
  proposedDate: null,
};

afterEach(() => {
  vi.useRealTimers();
});

function freezeAt(iso: string) {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
}

describe('computePaymentStatus', () => {
  // ── Early exits ──

  it('returns "draft" when proposalStatus is null', () => {
    expect(computePaymentStatus(base)).toBe('draft');
  });

  it('returns "draft" when proposalStatus is "draft"', () => {
    expect(computePaymentStatus({ ...base, proposalStatus: 'draft' })).toBe('draft');
  });

  it('returns "sent" when proposal sent and not signed', () => {
    expect(computePaymentStatus({ ...base, proposalStatus: 'sent' })).toBe('sent');
  });

  it('returns "sent" when proposal viewed and not signed', () => {
    expect(computePaymentStatus({ ...base, proposalStatus: 'viewed' })).toBe('sent');
  });

  // ── Deposit pending / overdue ──

  it('returns "deposit_pending" when deposit required and within deadline', () => {
    freezeAt('2026-04-10T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-04-08T00:00:00Z',
        depositPercent: 50,
        depositDeadlineDays: 7,
      }),
    ).toBe('deposit_pending');
  });

  it('returns "deposit_overdue" when deposit deadline exceeded', () => {
    freezeAt('2026-04-20T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-04-08T00:00:00Z',
        depositPercent: 50,
        depositDeadlineDays: 7,
      }),
    ).toBe('deposit_overdue');
  });

  it('uses 7-day default deadline when depositDeadlineDays is null', () => {
    freezeAt('2026-04-16T12:00:00Z'); // 8 days after sign → overdue
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-04-08T00:00:00Z',
        depositPercent: 25,
      }),
    ).toBe('deposit_overdue');
  });

  it('uses acceptedAt when signedAt is null', () => {
    freezeAt('2026-04-09T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        acceptedAt: '2026-04-08T00:00:00Z',
        depositPercent: 50,
        depositDeadlineDays: 7,
      }),
    ).toBe('deposit_pending');
  });

  // ── Deposit received ──

  it('returns "deposit_received" when deposit paid and event far away', () => {
    freezeAt('2026-04-10T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-04-01T00:00:00Z',
        depositPercent: 50,
        depositPaidAt: '2026-04-05T00:00:00Z',
        proposedDate: '2026-08-01',
        paymentDueDays: 14,
      }),
    ).toBe('deposit_received');
  });

  // ── Balance due / overdue ──

  it('returns "balance_due" when within 14 days of balance due date', () => {
    // Event: May 1, paymentDueDays: 14 → balance due: Apr 17
    // Now: Apr 10 → 7 days before balance due → within 14-day window
    freezeAt('2026-04-10T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-03-01T00:00:00Z',
        depositPercent: 50,
        depositPaidAt: '2026-03-05T00:00:00Z',
        proposedDate: '2026-05-01',
        paymentDueDays: 14,
      }),
    ).toBe('balance_due');
  });

  it('returns "balance_overdue" when past balance due date', () => {
    // Event: May 1, paymentDueDays: 14 → balance due: Apr 17
    // Now: Apr 20 → past due
    freezeAt('2026-04-20T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-03-01T00:00:00Z',
        depositPercent: 50,
        depositPaidAt: '2026-03-05T00:00:00Z',
        proposedDate: '2026-05-01',
        paymentDueDays: 14,
      }),
    ).toBe('balance_overdue');
  });

  it('returns "balance_overdue" when no deposit required and past due date', () => {
    freezeAt('2026-04-20T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-03-01T00:00:00Z',
        depositPercent: 0,
        proposedDate: '2026-05-01',
        paymentDueDays: 14,
      }),
    ).toBe('balance_overdue');
  });

  it('uses 14-day default when paymentDueDays is null', () => {
    freezeAt('2026-04-20T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-03-01T00:00:00Z',
        depositPercent: 0,
        proposedDate: '2026-05-01',
      }),
    ).toBe('balance_overdue');
  });

  // ── No proposed date ──

  it('returns "deposit_received" when deposit paid but no proposed date', () => {
    freezeAt('2026-04-10T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-04-01T00:00:00Z',
        depositPercent: 50,
        depositPaidAt: '2026-04-05T00:00:00Z',
      }),
    ).toBe('deposit_received');
  });

  it('returns "sent" when no deposit, no proposed date, and signed', () => {
    freezeAt('2026-04-10T12:00:00Z');
    expect(
      computePaymentStatus({
        ...base,
        proposalStatus: 'accepted',
        signedAt: '2026-04-01T00:00:00Z',
        depositPercent: 0,
      }),
    ).toBe('sent');
  });
});

describe('paymentStatusLabel', () => {
  it('returns human-readable labels for actionable statuses', () => {
    expect(paymentStatusLabel('deposit_pending')).toBe('Deposit pending');
    expect(paymentStatusLabel('deposit_overdue')).toBe('Deposit overdue');
    expect(paymentStatusLabel('deposit_received')).toBe('Deposit paid');
    expect(paymentStatusLabel('balance_due')).toBe('Balance due');
    expect(paymentStatusLabel('balance_overdue')).toBe('Balance overdue');
    expect(paymentStatusLabel('paid')).toBe('Paid');
  });

  it('returns null for non-actionable statuses', () => {
    expect(paymentStatusLabel('draft')).toBeNull();
    expect(paymentStatusLabel('sent')).toBeNull();
    expect(paymentStatusLabel('no_proposal')).toBeNull();
    expect(paymentStatusLabel(null)).toBeNull();
  });
});

describe('paymentStatusColor', () => {
  it('returns amber for pending statuses', () => {
    expect(paymentStatusColor('deposit_pending')).toBe('var(--color-neon-amber)');
    expect(paymentStatusColor('balance_due')).toBe('var(--color-neon-amber)');
  });

  it('returns error for overdue statuses', () => {
    expect(paymentStatusColor('deposit_overdue')).toBe('var(--color-unusonic-error)');
    expect(paymentStatusColor('balance_overdue')).toBe('var(--color-unusonic-error)');
  });

  it('returns success for paid statuses', () => {
    expect(paymentStatusColor('deposit_received')).toBe('var(--color-unusonic-success)');
    expect(paymentStatusColor('paid')).toBe('var(--color-unusonic-success)');
  });

  it('returns null for non-actionable statuses', () => {
    expect(paymentStatusColor('draft')).toBeNull();
    expect(paymentStatusColor(null)).toBeNull();
  });
});
