'use client';

import { motion } from 'framer-motion';
import { Banknote, DollarSign } from 'lucide-react';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 2,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return 'TBD';
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

interface PayViewProps {
  defaultHourlyRate: number | null;
  skillRates: Array<{ tag: string; hourlyRate: number }>;
  assignments: Array<{ id: string; role: string; dayRate: number; date: string | null }>;
}

export function PayView({ defaultHourlyRate, skillRates, assignments }: PayViewProps) {
  const hasRates = defaultHourlyRate != null || skillRates.length > 0;
  const hasAssignments = assignments.length > 0;

  if (!hasRates && !hasAssignments) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <Banknote className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No rate or pay information available yet. Your team admin will set your rates.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
      className="flex flex-col gap-8"
    >
      {/* Rate card */}
      {hasRates && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Rates
          </h2>
          <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] p-4">
            {defaultHourlyRate != null && (
              <div className="flex items-center justify-between py-2 border-b border-[oklch(1_0_0/0.04)] last:border-0">
                <span className="text-sm text-[var(--stage-text-secondary)]">Default hourly</span>
                <span className="text-sm font-medium text-[var(--stage-text-primary)]">
                  {formatCurrency(defaultHourlyRate)}/hr
                </span>
              </div>
            )}
            {skillRates.map((s) => (
              <div key={s.tag} className="flex items-center justify-between py-2 border-b border-[oklch(1_0_0/0.04)] last:border-0">
                <span className="text-sm text-[var(--stage-text-secondary)]">{s.tag}</span>
                <span className="text-sm font-medium text-[var(--stage-text-primary)]">
                  {formatCurrency(s.hourlyRate)}/hr
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Assignment pay history */}
      {hasAssignments && (
        <section className="flex flex-col gap-3">
          <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
            Assignment history
          </h2>
          <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] divide-y divide-[oklch(1_0_0/0.04)]">
            {assignments.map((a) => (
              <div key={a.id} className="flex items-center justify-between p-4">
                <div className="min-w-0">
                  <p className="text-sm text-[var(--stage-text-primary)]">{a.role}</p>
                  <p className="text-xs text-[var(--stage-text-tertiary)]">{formatDate(a.date)}</p>
                </div>
                <div className="flex items-center gap-1 text-sm font-medium text-[var(--stage-text-primary)]">
                  <DollarSign className="size-3.5" />
                  {formatCurrency(a.dayRate)}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </motion.div>
  );
}
