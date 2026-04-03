'use client';

import { motion } from 'framer-motion';
import { Banknote, DollarSign } from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return 'TBD';
  return new Date(iso).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

function getMonthKey(iso: string | null): string {
  if (!iso) return 'Unknown';
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function formatMonthLabel(key: string): string {
  if (key === 'Unknown') return 'Unknown';
  const [year, month] = key.split('-');
  const d = new Date(Number(year), Number(month) - 1);
  return d.toLocaleDateString('en-US', { month: 'long', year: 'numeric' });
}

interface PayViewProps {
  defaultHourlyRate: number | null;
  skillRates: Array<{ tag: string; hourlyRate: number }>;
  assignments: Array<{ id: string; role: string; dayRate: number; date: string | null; eventTitle?: string | null }>;
}

export function PayView({ defaultHourlyRate, skillRates, assignments }: PayViewProps) {
  const hasRates = defaultHourlyRate != null || skillRates.length > 0;
  const hasAssignments = assignments.length > 0;

  // Group assignments by month
  const grouped = new Map<string, typeof assignments>();
  for (const a of assignments) {
    const key = getMonthKey(a.date);
    const list = grouped.get(key) ?? [];
    list.push(a);
    grouped.set(key, list);
  }

  // Overall totals
  const totalEarned = assignments.reduce((sum, a) => sum + a.dayRate, 0);
  const totalShows = assignments.length;

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
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      {/* Earnings summary */}
      {hasAssignments && (
        <div className="flex items-center gap-6 p-5 rounded-2xl border border-[oklch(1_0_0/0.1)] bg-[var(--stage-surface-elevated)]">
          <div className="flex-1">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
              Total earned
            </p>
            <p className="text-2xl font-semibold tracking-tight text-[var(--stage-text-primary)] mt-1">
              {formatCurrency(totalEarned)}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
              Shows
            </p>
            <p className="text-2xl font-semibold tracking-tight text-[var(--stage-text-primary)] mt-1">
              {totalShows}
            </p>
          </div>
        </div>
      )}

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

      {/* Assignment history grouped by month */}
      {hasAssignments && (
        <section className="flex flex-col gap-4">
          {[...grouped.entries()].map(([monthKey, items]) => {
            const monthTotal = items.reduce((sum, a) => sum + a.dayRate, 0);
            return (
              <div key={monthKey} className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
                    {formatMonthLabel(monthKey)}
                  </h2>
                  <span className="text-xs font-medium text-[var(--stage-text-secondary)]">
                    {items.length} {items.length === 1 ? 'show' : 'shows'} · {formatCurrency(monthTotal)}
                  </span>
                </div>
                <div className="rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)] divide-y divide-[oklch(1_0_0/0.04)]">
                  {items.map((a) => (
                    <div key={a.id} className="flex items-center justify-between p-4">
                      <div className="min-w-0">
                        <p className="text-sm text-[var(--stage-text-primary)]">
                          {a.eventTitle ?? a.role}
                        </p>
                        <p className="text-xs text-[var(--stage-text-tertiary)]">
                          {a.role} · {formatDate(a.date)}
                        </p>
                      </div>
                      <div className="flex items-center gap-1 text-sm font-medium text-[var(--stage-text-primary)]">
                        <DollarSign className="size-3.5" />
                        {formatCurrency(a.dayRate)}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </section>
      )}
    </motion.div>
  );
}
