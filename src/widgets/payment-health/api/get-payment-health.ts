'use server';

import { createClient } from '@/shared/api/supabase/server';
import { getActiveWorkspaceId } from '@/shared/lib/workspace';

export type PaymentHealthMetrics = {
  overdueCount: number;
  overdueAmount: number;
  nextPayment: {
    dealTitle: string;
    dueDate: string;
    amount: number | null;
    type: 'deposit' | 'balance';
  } | null;
};

export async function getPaymentHealthMetrics(): Promise<PaymentHealthMetrics> {
  const workspaceId = await getActiveWorkspaceId();
  if (!workspaceId) return { overdueCount: 0, overdueAmount: 0, nextPayment: null };

  const supabase = await createClient();
  const now = Date.now();

  // Fetch signed proposals with deal data
  const { data: proposals } = await supabase
    .from('proposals')
    .select(`
      id, deal_id, status,
      signed_at, accepted_at,
      deposit_percent, deposit_paid_at, deposit_deadline_days,
      payment_due_days
    `)
    .eq('workspace_id', workspaceId)
    .in('status', ['sent', 'viewed', 'accepted']);

  if (!proposals?.length) return { overdueCount: 0, overdueAmount: 0, nextPayment: null };

  const proposalIds = proposals.map((p) => p.id);
  const dealIds = [...new Set(proposals.map((p) => p.deal_id).filter(Boolean) as string[])];

  // Fetch proposal items to compute real totals
  const { data: items } = await supabase
    .from('proposal_items')
    .select('proposal_id, quantity, unit_price, override_price, is_optional')
    .in('proposal_id', proposalIds);

  const totalByProposal = new Map<string, number>();
  for (const item of items ?? []) {
    if (item.is_optional) continue; // optional items excluded from totals
    const price = item.override_price ?? item.unit_price ?? 0;
    const qty = item.quantity ?? 1;
    totalByProposal.set(item.proposal_id, (totalByProposal.get(item.proposal_id) ?? 0) + price * qty);
  }

  const { data: deals } = await supabase
    .from('deals')
    .select('id, title, proposed_date')
    .in('id', dealIds)
    .is('archived_at', null);

  const dealMap = new Map(
    (deals ?? []).map((d) => [d.id, d as { id: string; title: string | null; proposed_date: string | null }]),
  );

  // Workspace defaults
  const { data: ws } = await supabase
    .from('workspaces')
    .select('default_deposit_deadline_days, default_balance_due_days_before_event')
    .eq('id', workspaceId)
    .maybeSingle();

  const wsDepositDeadline = (ws as { default_deposit_deadline_days?: number } | null)?.default_deposit_deadline_days ?? 7;
  const wsBalanceDueBefore = (ws as { default_balance_due_days_before_event?: number } | null)?.default_balance_due_days_before_event ?? 14;

  let overdueCount = 0;
  let overdueAmount = 0;
  let nextPayment: PaymentHealthMetrics['nextPayment'] = null;
  let nextPaymentDate = Infinity;

  for (const p of proposals) {
    const deal = dealMap.get(p.deal_id);
    if (!deal) continue;

    const signDate = p.signed_at ?? p.accepted_at;
    const depositPercent = p.deposit_percent ?? 0;
    const deadlineDays = p.deposit_deadline_days ?? wsDepositDeadline;
    const balanceDueDaysBefore = p.payment_due_days ?? wsBalanceDueBefore;

    const total = totalByProposal.get(p.id) ?? 0;
    if (total === 0) continue;

    // Deposit check
    if (depositPercent > 0 && !p.deposit_paid_at && signDate) {
      const dueDate = new Date(new Date(signDate).getTime() + deadlineDays * 86400000);
      const depositAmount = Math.round(total * depositPercent / 100);

      if (now > dueDate.getTime()) {
        overdueCount++;
        overdueAmount += depositAmount;
      } else if (dueDate.getTime() < nextPaymentDate) {
        nextPaymentDate = dueDate.getTime();
        nextPayment = {
          dealTitle: deal.title ?? 'Untitled deal',
          dueDate: dueDate.toISOString().slice(0, 10),
          amount: depositAmount,
          type: 'deposit',
        };
      }
    }

    // Balance check
    const depositOk = depositPercent === 0 || !!p.deposit_paid_at;
    if (depositOk && deal.proposed_date) {
      const eventDate = new Date(deal.proposed_date);
      const dueDate = new Date(eventDate.getTime() - balanceDueDaysBefore * 86400000);

      if (now > dueDate.getTime()) {
        overdueCount++;
        overdueAmount += total;
      } else if (dueDate.getTime() < nextPaymentDate) {
        nextPaymentDate = dueDate.getTime();
        nextPayment = {
          dealTitle: deal.title ?? 'Untitled deal',
          dueDate: dueDate.toISOString().slice(0, 10),
          amount: total,
          type: 'balance',
        };
      }
    }
  }

  return { overdueCount, overdueAmount, nextPayment };
}
