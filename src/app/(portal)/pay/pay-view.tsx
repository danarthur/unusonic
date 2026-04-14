'use client';

import { useState, useMemo } from 'react';
import { format, subMonths, startOfMonth, isAfter, isBefore } from 'date-fns';
import { motion, AnimatePresence } from 'framer-motion';
import { Banknote, ChevronDown, FileText, Building } from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Formatting helpers ────────────────────────────────────── */

const currencyFmt = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
  minimumFractionDigits: 0,
  maximumFractionDigits: 0,
});

function formatCurrency(amount: number): string {
  return currencyFmt.format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return 'TBD';
  return format(new Date(iso), 'MMM d, yyyy');
}

function formatShortDate(iso: string | null): string {
  if (!iso) return 'TBD';
  return format(new Date(iso), 'MMM d');
}

/* ── Types ─────────────────────────────────────────────────── */

interface Assignment {
  id: string;
  role: string;
  eventTitle: string | null;
  date: string | null;
  baseRate: number;
  baseRateType: string | null;
  scheduledHours: number | null;
  overtimeHours: number | null;
  overtimeRate: number | null;
  travelStipend: number | null;
  perDiem: number | null;
  kitFee: number | null;
  bonus: number | null;
  grossTotal: number;
  paymentStatus: string;
  paymentDate: string | null;
}

interface PayViewProps {
  defaultHourlyRate: number | null;
  skillRates: Array<{ tag: string; hourlyRate: number }>;
  assignments: Assignment[];
  paymentTerms?: string | null;
}

/* ── Status badge ──────────────────────────────────────────── */

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  completed: 'Completed',
  submitted: 'Submitted',
  approved: 'Approved',
  processing: 'Processing',
  paid: 'Paid',
};

function statusColor(status: string): string {
  switch (status) {
    case 'completed':
      return 'text-[oklch(0.75_0.15_55)]'; // amber
    case 'submitted':
    case 'approved':
    case 'processing':
      return 'text-[oklch(0.65_0.15_250)]'; // blue
    case 'paid':
      return 'text-[oklch(0.75_0.15_145)]'; // green
    default:
      return 'text-[var(--stage-text-tertiary)]'; // neutral
  }
}

function StatusBadge({ status }: { status: string }) {
  return (
    <span className={`text-xs font-medium ${statusColor(status)}`}>
      {STATUS_LABELS[status] ?? status}
    </span>
  );
}

/* ── Rate breakdown line ───────────────────────────────────── */

function BreakdownLine({ label, amount }: { label: string; amount: number }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-[var(--stage-text-secondary)]">{label}</span>
      <span className="tabular-nums text-[var(--stage-text-primary)]">
        {formatCurrency(amount)}
      </span>
    </div>
  );
}

/* ── Assignment card ───────────────────────────────────────── */

function AssignmentCard({
  assignment,
  expanded,
  onToggle,
}: {
  assignment: Assignment;
  expanded: boolean;
  onToggle: () => void;
}) {
  const a = assignment;

  // Determine rate label
  const baseLabel =
    a.baseRateType === 'hourly' && a.scheduledHours
      ? `${formatCurrency(a.baseRate)}/hr x ${a.scheduledHours}h`
      : 'Day rate';

  const baseEarnings =
    a.baseRateType === 'hourly' && a.scheduledHours
      ? a.baseRate * a.scheduledHours
      : a.baseRate;

  const otEarnings =
    a.overtimeHours && a.overtimeRate
      ? a.overtimeHours * a.overtimeRate
      : 0;

  const hasExtras =
    (a.travelStipend && a.travelStipend > 0) ||
    (a.perDiem && a.perDiem > 0) ||
    (a.kitFee && a.kitFee > 0) ||
    (a.bonus && a.bonus > 0) ||
    otEarnings > 0;

  return (
    <div className="flex flex-col">
      <button
        type="button"
        onClick={onToggle}
        className="flex items-center justify-between p-4 text-left transition-colors duration-[80ms] hover:bg-[oklch(1_0_0/0.02)]"
      >
        <div className="flex flex-col gap-0.5 min-w-0">
          <p className="text-sm text-[var(--stage-text-primary)] truncate">
            {a.eventTitle ?? a.role}
          </p>
          <p className="text-xs text-[var(--stage-text-secondary)]">
            {a.role} · {formatShortDate(a.date)}
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <div className="flex flex-col items-end gap-0.5">
            <span className="text-sm font-medium tabular-nums text-[var(--stage-text-primary)]">
              {formatCurrency(a.grossTotal)}
            </span>
            <StatusBadge status={a.paymentStatus} />
          </div>
          <ChevronDown
            className={`size-4 text-[var(--stage-text-tertiary)] transition-transform duration-150 ${
              expanded ? 'rotate-180' : ''
            }`}
          />
        </div>
      </button>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 flex flex-col gap-2">
              <div className="flex flex-col gap-1.5 py-2">
                <BreakdownLine label={baseLabel} amount={baseEarnings} />
                {otEarnings > 0 && a.overtimeHours && a.overtimeRate && (
                  <BreakdownLine
                    label={`Overtime (${a.overtimeHours}h x ${formatCurrency(a.overtimeRate)})`}
                    amount={otEarnings}
                  />
                )}
                {a.travelStipend != null && a.travelStipend > 0 && (
                  <BreakdownLine label="Travel" amount={a.travelStipend} />
                )}
                {a.perDiem != null && a.perDiem > 0 && (
                  <BreakdownLine label="Per diem" amount={a.perDiem} />
                )}
                {a.kitFee != null && a.kitFee > 0 && (
                  <BreakdownLine label="Kit fee" amount={a.kitFee} />
                )}
                {a.bonus != null && a.bonus > 0 && (
                  <BreakdownLine label="Bonus" amount={a.bonus} />
                )}

                {hasExtras && (
                  <>
                    <div className="border-t border-[oklch(1_0_0/0.06)] my-1" />
                    <div className="flex items-center justify-between text-sm font-medium">
                      <span className="text-[var(--stage-text-secondary)]">
                        Gross total
                      </span>
                      <span className="tabular-nums text-[var(--stage-text-primary)]">
                        {formatCurrency(a.grossTotal)}
                      </span>
                    </div>
                  </>
                )}

                {/* Status + expected date */}
                <div className="flex items-center justify-between text-xs mt-1">
                  <span className="text-[var(--stage-text-secondary)]">
                    Status
                  </span>
                  <StatusBadge status={a.paymentStatus} />
                </div>
                {a.paymentDate && (
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-[var(--stage-text-secondary)]">
                      Expected
                    </span>
                    <span className="text-[var(--stage-text-primary)]">
                      {formatDate(a.paymentDate)}
                    </span>
                  </div>
                )}
              </div>

              {/* Flag issue — pending real submission flow. The placeholder
                  toast was misleading (no manager actually got notified), so
                  the entry point was removed until the real dispute path lands. */}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Earnings chart ────────────────────────────────────────── */

function EarningsChart({ assignments }: { assignments: Assignment[] }) {
  const now = new Date();

  const monthBuckets = useMemo(() => {
    // Build 6-month range (current month and 5 prior)
    const months: { key: string; label: string; start: Date; end: Date }[] = [];
    for (let i = 5; i >= 0; i--) {
      const start = startOfMonth(subMonths(now, i));
      const end = startOfMonth(subMonths(now, i - 1));
      months.push({
        key: format(start, 'yyyy-MM'),
        label: format(start, 'MMM'),
        start,
        end,
      });
    }

    // Sum paid assignments per month
    const paidAssignments = assignments.filter(
      (a) => a.paymentStatus === 'paid' && a.date
    );

    return months.map((m) => {
      const total = paidAssignments
        .filter((a) => {
          const d = new Date(a.date!);
          return !isBefore(d, m.start) && isBefore(d, m.end);
        })
        .reduce((sum, a) => sum + a.grossTotal, 0);
      return { ...m, total };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);

  const maxEarnings = Math.max(...monthBuckets.map((m) => m.total), 1);
  const BAR_MAX = 120;

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
        Earnings
      </h2>
      <div
        data-surface="surface"
        className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface-elevated)] p-5"
      >
        <div className="flex items-end justify-between gap-3" style={{ height: BAR_MAX + 40 }}>
          {monthBuckets.map((m) => {
            const barH = m.total > 0 ? Math.max((m.total / maxEarnings) * BAR_MAX, 2) : 2;
            return (
              <div key={m.key} className="flex flex-col items-center gap-1 flex-1">
                {m.total > 0 && (
                  <span className="text-label tabular-nums text-[var(--stage-text-secondary)]">
                    {formatCurrency(m.total)}
                  </span>
                )}
                <div
                  className="w-full rounded-sm bg-[var(--stage-text-primary)]"
                  style={{
                    height: barH,
                    opacity: m.total > 0 ? 0.85 : 0.12,
                  }}
                />
                <span className="text-label text-[var(--stage-text-secondary)]">
                  {m.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

/* ── Main view ─────────────────────────────────────────────── */

export function PayView({
  defaultHourlyRate,
  skillRates,
  assignments,
  paymentTerms,
}: PayViewProps) {
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const hasRates = defaultHourlyRate != null || skillRates.length > 0;
  const hasAssignments = assignments.length > 0;

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Categorize assignments
  const now = new Date();
  const yearStart = new Date(now.getFullYear(), 0, 1);
  const sixtyDaysAgo = subMonths(now, 2);

  const grouped = useMemo(() => {
    const actionNeeded: Assignment[] = []; // completed, waiting for submission
    const processing: Assignment[] = []; // submitted/approved/processing
    const upcoming: Assignment[] = []; // future date
    const recentlyPaid: Assignment[] = []; // paid, last 60 days
    const pending: Assignment[] = []; // pending + past

    for (const a of assignments) {
      const isFuture = a.date ? isAfter(new Date(a.date), now) : false;

      if (isFuture) {
        upcoming.push(a);
      } else if (a.paymentStatus === 'completed') {
        actionNeeded.push(a);
      } else if (['submitted', 'approved', 'processing'].includes(a.paymentStatus)) {
        processing.push(a);
      } else if (a.paymentStatus === 'paid') {
        if (a.date && isAfter(new Date(a.date), sixtyDaysAgo)) {
          recentlyPaid.push(a);
        }
        // older paid assignments are excluded from the list
      } else {
        // pending or unknown
        pending.push(a);
      }
    }

    return { actionNeeded, processing, upcoming, recentlyPaid, pending };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignments]);

  // Hero metrics
  const ytdEarned = assignments
    .filter(
      (a) =>
        a.paymentStatus === 'paid' &&
        a.date &&
        !isBefore(new Date(a.date), yearStart) &&
        isBefore(new Date(a.date), now)
    )
    .reduce((sum, a) => sum + a.grossTotal, 0);

  const pendingPayment = assignments
    .filter((a) =>
      ['completed', 'submitted', 'approved', 'processing'].includes(
        a.paymentStatus
      )
    )
    .reduce((sum, a) => sum + a.grossTotal, 0);

  const upcomingTotal = grouped.upcoming.reduce(
    (sum, a) => sum + a.grossTotal,
    0
  );

  if (!hasRates && !hasAssignments) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-4 text-center">
        <Banknote className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No rate or pay information available yet. Your team admin will set
          your rates.
        </p>
        <a
          href="/profile"
          className="text-xs text-[var(--stage-text-secondary)] underline underline-offset-2 hover:text-[var(--stage-text-primary)] transition-colors duration-[80ms]"
        >
          Check your profile for skills and contact info
        </a>
      </div>
    );
  }

  const sections: { key: string; label: string; items: Assignment[] }[] = [
    { key: 'action', label: 'Action needed', items: grouped.actionNeeded },
    { key: 'processing', label: 'Processing', items: grouped.processing },
    { key: 'upcoming', label: 'Upcoming', items: grouped.upcoming },
    { key: 'recent', label: 'Recently paid', items: grouped.recentlyPaid },
    { key: 'pending', label: 'Pending', items: grouped.pending },
  ].filter((s) => s.items.length > 0);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.12, ease: 'easeOut' }}
      className="flex flex-col gap-6"
    >
      <h1 className="sr-only">Pay</h1>

      {/* ── Section 1: Hero metrics ──────────────────────────── */}
      {hasAssignments && (
        <div className="flex flex-col gap-3">
          {/* YTD hero — full width */}
          <div
            data-surface="elevated"
            className="flex flex-col gap-1 p-5 rounded-xl bg-[var(--stage-surface-elevated)]"
          >
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
              YTD Earned
            </p>
            <p className="text-2xl font-semibold tracking-tight tabular-nums text-[var(--stage-text-primary)]">
              {formatCurrency(ytdEarned)}
            </p>
          </div>
          {/* Pending + Upcoming — 2-col */}
          <div className="grid grid-cols-2 gap-3">
            <div
              data-surface="surface"
              className="flex flex-col gap-1 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                Pending payment
              </p>
              <p className="text-lg font-semibold tracking-tight tabular-nums text-[var(--stage-text-primary)]">
                {formatCurrency(pendingPayment)}
              </p>
            </div>
            <div
              data-surface="surface"
              className="flex flex-col gap-1 p-4 rounded-xl bg-[var(--stage-surface-elevated)]"
            >
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                Upcoming
              </p>
              <p className="text-lg font-semibold tracking-tight tabular-nums text-[var(--stage-text-primary)]">
                {formatCurrency(upcomingTotal)}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ── Section 2: Assignments grouped by status ─────────── */}
      {sections.length > 0 && (
        <div className="flex flex-col gap-5">
          {sections.map((section) => (
            <section key={section.key} className="flex flex-col gap-2">
              <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                {section.label}
              </h2>
              <div
                data-surface="surface"
                className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] divide-y divide-[oklch(1_0_0/0.04)]"
              >
                {section.items.map((a) => (
                  <AssignmentCard
                    key={a.id}
                    assignment={a}
                    expanded={expandedIds.has(a.id)}
                    onToggle={() => toggleExpanded(a.id)}
                  />
                ))}
              </div>
            </section>
          ))}
        </div>
      )}

      {/* ── Section 3: Earnings chart ────────────────────────── */}
      {hasAssignments && <EarningsChart assignments={assignments} />}

      {/* ── Section 4: Rate card ─────────────────────────────── */}
      {hasRates && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
            Rates
          </h2>
          <div
            data-surface="surface"
            className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] p-4 flex flex-col"
          >
            {defaultHourlyRate != null && (
              <div className="flex items-center justify-between py-2 border-b border-[oklch(1_0_0/0.04)] last:border-0">
                <span className="text-sm text-[var(--stage-text-secondary)]">
                  Default hourly
                </span>
                <span className="text-sm font-medium tabular-nums text-[var(--stage-text-primary)]">
                  {formatCurrency(defaultHourlyRate)}/hr
                </span>
              </div>
            )}
            {skillRates.map((s) => (
              <div
                key={s.tag}
                className="flex items-center justify-between py-2 border-b border-[oklch(1_0_0/0.04)] last:border-0"
              >
                <span className="text-sm text-[var(--stage-text-secondary)]">
                  {s.tag}
                </span>
                <span className="text-sm font-medium tabular-nums text-[var(--stage-text-primary)]">
                  {formatCurrency(s.hourlyRate)}/hr
                </span>
              </div>
            ))}
          </div>
        </section>
      )}
      {/* ── Payment Terms ─────────────────────────────────────── */}
      {paymentTerms && (
        <div className="p-4 rounded-xl bg-[var(--stage-surface-elevated)]" data-surface="elevated">
          <div className="flex items-center gap-2 mb-2">
            <Banknote className="size-4 text-[var(--stage-text-secondary)]" />
            <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
              Payment terms
            </h2>
          </div>
          <p className="text-sm text-[var(--stage-text-secondary)]">{paymentTerms}</p>
        </div>
      )}

      {/* ── Tax Documents ─────────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-[var(--stage-surface-elevated)]" data-surface="elevated">
        <div className="flex items-center gap-2 mb-2">
          <FileText className="size-4 text-[var(--stage-text-secondary)]" />
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
            Tax documents
          </h2>
        </div>
        <p className="text-sm text-[var(--stage-text-secondary)]">
          1099 and W-2 documents will be available here in January. Contact your manager for current tax documentation.
        </p>
      </div>

      {/* ── Direct Deposit ────────────────────────────────────── */}
      <div className="p-4 rounded-xl bg-[var(--stage-surface-elevated)]" data-surface="elevated">
        <div className="flex items-center gap-2 mb-2">
          <Building className="size-4 text-[var(--stage-text-secondary)]" />
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
            Direct deposit
          </h2>
        </div>
        <p className="text-sm text-[var(--stage-text-secondary)] mb-3">
          Manage your bank account for direct deposit payments.
        </p>
        <a
          href="/profile"
          className="text-sm font-medium text-[var(--stage-text-primary)] hover:opacity-80 transition-opacity duration-[80ms]"
        >
          Update in profile settings →
        </a>
      </div>
    </motion.div>
  );
}
