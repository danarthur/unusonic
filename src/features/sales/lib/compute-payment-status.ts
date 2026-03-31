/**
 * Shared payment status computation.
 * Used by: CRM stream cards, DealDetailsCard signals, cron reminders.
 * Pure function — no DB calls, no side effects.
 */

export type PaymentStatus =
  | 'no_proposal'
  | 'draft'
  | 'sent'
  | 'deposit_pending'
  | 'deposit_overdue'
  | 'deposit_received'
  | 'balance_due'
  | 'balance_overdue'
  | 'paid'
  | null;

export type PaymentStatusInput = {
  proposalStatus: string | null;
  signedAt: string | null;
  acceptedAt: string | null;
  depositPercent: number | null;
  depositPaidAt: string | null;
  depositDeadlineDays: number | null;
  paymentDueDays: number | null;
  proposedDate: string | null;
};

/**
 * Computes the current payment status for a deal/proposal pair.
 *
 * Precedence:
 *   1. No proposal or still draft → `no_proposal` / `draft`
 *   2. Proposal sent but not signed → `sent`
 *   3. Signed, deposit required, not paid → `deposit_pending` or `deposit_overdue`
 *   4. Deposit paid (or no deposit required), balance not yet due → `deposit_received`
 *   5. Balance due window open → `balance_due` or `balance_overdue`
 *   6. Fully paid → `paid` (placeholder — no full-payment tracking yet)
 */
export function computePaymentStatus(input: PaymentStatusInput): PaymentStatus {
  const {
    proposalStatus,
    signedAt,
    acceptedAt,
    depositPercent,
    depositPaidAt,
    depositDeadlineDays,
    paymentDueDays,
    proposedDate,
  } = input;

  if (!proposalStatus || proposalStatus === 'draft') return 'draft';
  if (proposalStatus === 'sent' || proposalStatus === 'viewed') {
    // Not yet signed/accepted
    if (!signedAt && !acceptedAt) return 'sent';
  }

  // Signed/accepted — check deposit
  const signDate = signedAt ?? acceptedAt;
  const hasDeposit = (depositPercent ?? 0) > 0;

  if (hasDeposit && !depositPaidAt && signDate) {
    const deadlineDays = depositDeadlineDays ?? 7;
    const daysSinceSigned = Math.floor(
      (Date.now() - new Date(signDate).getTime()) / 86400000,
    );
    if (daysSinceSigned > deadlineDays) return 'deposit_overdue';
    return 'deposit_pending';
  }

  // Deposit paid or not required — check balance due
  const depositOk = !hasDeposit || !!depositPaidAt;
  if (depositOk && proposedDate) {
    const balanceDueDaysBefore = paymentDueDays ?? 14;
    const eventDate = new Date(proposedDate + 'T00:00:00').getTime();
    const balanceDueDate = eventDate - balanceDueDaysBefore * 86400000;
    const now = Date.now();

    if (now > balanceDueDate) return 'balance_overdue';
    // Show "balance_due" when within 14 days of the due date
    if (balanceDueDate - now < 14 * 86400000) return 'balance_due';

    return depositPaidAt ? 'deposit_received' : 'sent';
  }

  if (depositPaidAt) return 'deposit_received';
  return 'sent';
}

/** Human-readable label for stream card pills. */
export function paymentStatusLabel(status: PaymentStatus): string | null {
  switch (status) {
    case 'deposit_pending': return 'Deposit pending';
    case 'deposit_overdue': return 'Deposit overdue';
    case 'deposit_received': return 'Deposit paid';
    case 'balance_due': return 'Balance due';
    case 'balance_overdue': return 'Balance overdue';
    case 'paid': return 'Paid';
    default: return null;
  }
}

/** Color token for status pill. */
export function paymentStatusColor(status: PaymentStatus): string | null {
  switch (status) {
    case 'deposit_pending':
    case 'balance_due':
      return 'var(--color-neon-amber)';
    case 'deposit_overdue':
    case 'balance_overdue':
      return 'var(--color-unusonic-error)';
    case 'deposit_received':
    case 'paid':
      return 'var(--color-unusonic-success)';
    default:
      return null;
  }
}
