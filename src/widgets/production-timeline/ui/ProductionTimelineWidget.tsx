'use client';

import { useMemo } from 'react';
import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { PaymentMilestone } from '@/features/sales/lib/compute-payment-milestones';

/* ─── Milestone Types ─── */

type DealMilestone = {
  id: string;
  type: 'deal';
  date: string;
  label: string;
  status: 'complete' | 'upcoming';
};

type ProductionMilestone = {
  id: string;
  type: 'event';
  date: string;
  label: string;
};

type TimelineMilestone = PaymentMilestone | ProductionMilestone | DealMilestone;

/* ─── Color Resolution ─── */

function milestoneColor(m: TimelineMilestone): string {
  if (m.type === 'event') return 'var(--stage-text-primary)';
  if (m.type === 'deal') {
    return m.status === 'complete' ? 'var(--stage-text-secondary)' : 'var(--stage-text-tertiary)';
  }
  // Payment milestones
  const pm = m as PaymentMilestone;
  switch (pm.status) {
    case 'paid': return 'var(--color-unusonic-success)';
    case 'overdue': return 'var(--color-unusonic-error)';
    case 'due_soon': return 'var(--color-unusonic-warning)';
    default: return 'var(--stage-text-tertiary)';
  }
}

function isFilled(m: TimelineMilestone): boolean {
  if (m.type === 'event') return true;
  if (m.type === 'deal') return m.status === 'complete';
  return (m as PaymentMilestone).status === 'paid';
}

/* ─── Helpers ─── */

function formatShortDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function isToday(iso: string): boolean {
  return iso === new Date().toISOString().slice(0, 10);
}

/* ─── Props ─── */

export type ProductionTimelineWidgetProps = {
  eventDate: string | null;
  eventTitle?: string | null;
  paymentMilestones: PaymentMilestone[];
  /** Deal lifecycle milestones — created, proposal sent, viewed, signed, deposit paid, handover, crew, load */
  dealMilestones?: {
    createdAt?: string | null;
    proposalSentAt?: string | null;
    proposalViewedAt?: string | null;
    proposalSignedAt?: string | null;
    depositPaidAt?: string | null;
    handedOverAt?: string | null;
    crewConfirmedAt?: string | null;
    loadInAt?: string | null;
    loadOutAt?: string | null;
  };
};

/* ─── Component ─── */

export function ProductionTimelineWidget({
  eventDate,
  eventTitle,
  paymentMilestones,
  dealMilestones,
}: ProductionTimelineWidgetProps) {
  const milestones = useMemo(() => {
    const list: TimelineMilestone[] = [...paymentMilestones];

    // Deal lifecycle milestones (past events that already happened)
    if (dealMilestones?.createdAt) {
      list.push({
        id: 'deal_created',
        type: 'deal',
        date: dealMilestones.createdAt.slice(0, 10),
        label: 'Deal created',
        status: 'complete',
      });
    }
    if (dealMilestones?.proposalSentAt) {
      list.push({
        id: 'proposal_sent',
        type: 'deal',
        date: dealMilestones.proposalSentAt.slice(0, 10),
        label: 'Proposal sent',
        status: 'complete',
      });
    }
    if (dealMilestones?.proposalViewedAt) {
      list.push({
        id: 'proposal_viewed',
        type: 'deal',
        date: dealMilestones.proposalViewedAt.slice(0, 10),
        label: 'Proposal viewed',
        status: 'complete',
      });
    }
    if (dealMilestones?.proposalSignedAt) {
      list.push({
        id: 'proposal_signed',
        type: 'deal',
        date: dealMilestones.proposalSignedAt.slice(0, 10),
        label: 'Proposal signed',
        status: 'complete',
      });
    }
    if (dealMilestones?.depositPaidAt) {
      list.push({
        id: 'deposit_paid',
        type: 'deal',
        date: dealMilestones.depositPaidAt.slice(0, 10),
        label: 'Deposit paid',
        status: 'complete',
      });
    }
    if (dealMilestones?.handedOverAt) {
      list.push({
        id: 'handed_over',
        type: 'deal',
        date: dealMilestones.handedOverAt.slice(0, 10),
        label: 'Handed over',
        status: 'complete',
      });
    }
    if (dealMilestones?.crewConfirmedAt) {
      list.push({
        id: 'crew_confirmed',
        type: 'deal',
        date: dealMilestones.crewConfirmedAt.slice(0, 10),
        label: 'Crew confirmed',
        status: 'complete',
      });
    }
    if (dealMilestones?.loadInAt) {
      const past = dealMilestones.loadInAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
      list.push({
        id: 'load_in',
        type: 'deal',
        date: dealMilestones.loadInAt.slice(0, 10),
        label: 'Load-in',
        status: past ? 'complete' : 'upcoming',
      });
    }
    if (dealMilestones?.loadOutAt) {
      const past = dealMilestones.loadOutAt.slice(0, 10) < new Date().toISOString().slice(0, 10);
      list.push({
        id: 'load_out',
        type: 'deal',
        date: dealMilestones.loadOutAt.slice(0, 10),
        label: 'Load-out',
        status: past ? 'complete' : 'upcoming',
      });
    }

    if (eventDate) {
      list.push({
        id: 'event_day',
        type: 'event',
        date: eventDate,
        label: eventTitle ?? 'Show day',
      });
    }

    // Sort chronologically, then by type priority for same-day (deal < payment < event)
    const typePriority: Record<string, number> = { deal: 0, deposit_due: 1, balance_due: 1, event: 2 };
    list.sort((a, b) => {
      const dateCmp = a.date.localeCompare(b.date);
      if (dateCmp !== 0) return dateCmp;
      return (typePriority[a.type] ?? 1) - (typePriority[b.type] ?? 1);
    });

    return list;
  }, [eventDate, eventTitle, paymentMilestones, dealMilestones]);

  if (milestones.length === 0) return null;

  return (
    <StagePanel elevated style={{ padding: 'var(--stage-padding, 16px)' }}>
      <p className="stage-label" style={{ color: 'var(--stage-text-secondary)', marginBottom: 'var(--stage-gap-wide, 12px)' }}>
        Timeline
      </p>

      <div className="flex flex-col" style={{ gap: 0 }}>
        {milestones.map((m, i) => {
          const color = milestoneColor(m);
          const filled = isFilled(m);
          const isEvent = m.type === 'event';
          const isPayment = m.type !== 'event' && m.type !== 'deal';
          const isPaid = isPayment && (m as PaymentMilestone).status === 'paid';
          const amount = isPayment ? (m as PaymentMilestone).amount : null;
          const today = isToday(m.date);
          const isLast = i === milestones.length - 1;

          return (
            <motion.div
              key={m.id}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ ...STAGE_LIGHT, delay: i * 0.04 }}
              className="flex items-stretch"
              style={{ minHeight: 'var(--stage-gap-wide, 12px)' }}
            >
              {/* Left column: date */}
              <div
                className="shrink-0 flex items-start justify-end tabular-nums stage-label"
                style={{
                  width: 52,
                  paddingTop: 2,
                  paddingRight: 'var(--stage-gap-wide, 12px)',
                  color: today ? 'var(--stage-text-primary)' : 'var(--stage-text-tertiary)',
                }}
              >
                {formatShortDate(m.date)}
              </div>

              {/* Center column: track line + dot */}
              <div className="relative flex flex-col items-center shrink-0" style={{ width: 20 }}>
                <div
                  className="relative z-10 shrink-0 flex items-center justify-center"
                  style={{
                    width: isEvent ? 10 : 8,
                    height: isEvent ? 10 : 8,
                    borderRadius: '50%',
                    marginTop: isEvent ? 3 : 4,
                    background: filled
                      ? color
                      : 'var(--stage-surface)',
                    border: filled ? 'none' : `1.5px solid ${color}`,
                  }}
                >
                  {isPaid && <Check size={6} strokeWidth={3} style={{ color: 'var(--stage-surface)' }} />}
                </div>
                {!isLast && (
                  <div
                    className="flex-1"
                    style={{
                      width: 1,
                      background: 'var(--stage-edge-subtle)',
                      marginTop: 2,
                      marginBottom: 2,
                    }}
                  />
                )}
              </div>

              {/* Right column: label + amount */}
              <div
                className="flex-1 min-w-0 flex items-baseline"
                style={{
                  paddingLeft: 'var(--stage-gap, 6px)',
                  paddingBottom: isLast ? 0 : 'var(--stage-gap-wide, 12px)',
                  gap: 'var(--stage-gap, 6px)',
                }}
              >
                <span
                  className="stage-label font-medium truncate"
                  style={{ color, paddingTop: 1 }}
                >
                  {m.label}
                  {today && (
                    <span style={{ color: 'var(--stage-text-tertiary)', fontWeight: 400 }}> · today</span>
                  )}
                </span>
                {amount != null && (
                  <span
                    className="stage-label tabular-nums shrink-0"
                    style={{ color: 'var(--stage-text-tertiary)' }}
                  >
                    {formatCurrency(amount)}
                  </span>
                )}
              </div>
            </motion.div>
          );
        })}
      </div>
    </StagePanel>
  );
}
