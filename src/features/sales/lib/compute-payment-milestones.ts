/**
 * Computes payment milestones (deposit due, balance due) from proposal + deal data.
 * Used by the ProductionTimeline widget to show payment dates alongside production dates.
 */

export type PaymentMilestone = {
  id: string;
  type: 'deposit_due' | 'balance_due';
  date: string; // ISO date string
  label: string;
  amount: number | null;
  status: 'paid' | 'upcoming' | 'due_soon' | 'overdue';
};

export type PaymentMilestoneInput = {
  signedAt: string | null;
  acceptedAt: string | null;
  depositPercent: number | null;
  depositPaidAt: string | null;
  depositDeadlineDays: number | null;
  paymentDueDays: number | null;
  proposedDate: string | null;
  proposalTotal: number | null;
};

export function computePaymentMilestones(input: PaymentMilestoneInput): PaymentMilestone[] {
  const milestones: PaymentMilestone[] = [];
  const now = Date.now();
  const signDate = input.signedAt ?? input.acceptedAt;
  const hasDeposit = (input.depositPercent ?? 0) > 0;
  const total = input.proposalTotal ?? 0;

  // ── Deposit milestone ──
  if (hasDeposit && signDate) {
    const deadlineDays = input.depositDeadlineDays ?? 7;
    const dueDate = new Date(new Date(signDate).getTime() + deadlineDays * 86400000);
    const depositAmount = Math.round(total * (input.depositPercent ?? 0) / 100);

    let status: PaymentMilestone['status'];
    if (input.depositPaidAt) {
      status = 'paid';
    } else if (now > dueDate.getTime()) {
      status = 'overdue';
    } else if (dueDate.getTime() - now < 3 * 86400000) {
      status = 'due_soon';
    } else {
      status = 'upcoming';
    }

    milestones.push({
      id: 'deposit_due',
      type: 'deposit_due',
      date: dueDate.toISOString().slice(0, 10),
      label: 'Deposit due',
      amount: depositAmount,
      status,
    });
  }

  // ── Balance milestone ──
  if (input.proposedDate) {
    const balanceDueDaysBefore = input.paymentDueDays ?? 14;
    const eventDate = new Date(input.proposedDate);
    const dueDate = new Date(eventDate.getTime() - balanceDueDaysBefore * 86400000);
    const balanceAmount = hasDeposit && input.depositPaidAt
      ? Math.round(total * (1 - (input.depositPercent ?? 0) / 100))
      : total;

    let status: PaymentMilestone['status'];
    if (now > dueDate.getTime()) {
      status = 'overdue';
    } else if (dueDate.getTime() - now < 7 * 86400000) {
      status = 'due_soon';
    } else {
      status = 'upcoming';
    }

    milestones.push({
      id: 'balance_due',
      type: 'balance_due',
      date: dueDate.toISOString().slice(0, 10),
      label: 'Balance due',
      amount: balanceAmount > 0 ? balanceAmount : null,
      status,
    });
  }

  return milestones;
}
