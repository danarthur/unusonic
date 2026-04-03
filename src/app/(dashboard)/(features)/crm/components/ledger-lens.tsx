'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { Wallet, ArrowDownRight, ArrowUpRight, Clock } from 'lucide-react';
import { StagePanel } from '@/shared/ui/stage-panel';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { EventLedgerDTO } from '@/features/finance/api/get-event-ledger';

type LedgerLensProps = {
  eventId: string;
  ledger: EventLedgerDTO | null;
};

export function LedgerLens({ eventId, ledger }: LedgerLensProps) {
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      className="flex flex-col gap-6"
    >
      {/* Waterfall card — Total Revenue / Estimated Cost / Projected Margin / EHR */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StagePanel elevated className="p-6 rounded-[var(--stage-radius-panel)] border-l-4 border-l-[var(--color-unusonic-success)]">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">Total revenue</p>
          <p className="text-xl font-semibold text-[var(--color-unusonic-success)] tracking-tight tabular-nums">
            {ledger ? ledger.fmt.totalRevenue : '—'}
          </p>
        </StagePanel>
        <StagePanel elevated className="p-6 rounded-[var(--stage-radius-panel)] border-l-4 border-l-[var(--color-unusonic-error)]">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">Estimated cost</p>
          <p className="text-xl font-semibold text-[var(--stage-text-secondary)] tracking-tight tabular-nums">
            {ledger ? ledger.fmt.totalCost : '—'}
          </p>
        </StagePanel>
        <StagePanel elevated className="p-6 rounded-[var(--stage-radius-panel)] border-l-4 border-l-[var(--color-unusonic-warning)]">
          <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1">Projected margin</p>
          <p className="text-xl font-semibold text-[var(--color-unusonic-warning)] tracking-tight tabular-nums">
            {ledger ? ledger.fmt.margin : '—'}
          </p>
        </StagePanel>
      </div>

      {/* Effective Hourly Rate — only shown when event hours are known */}
      {ledger?.effectiveHourlyRate != null && (
        <StagePanel elevated className="p-6 rounded-[var(--stage-radius-panel)] border-l-4 border-l-[var(--stage-text-primary)]">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] mb-1 flex items-center gap-1.5">
                <Clock size={14} strokeWidth={1.5} aria-hidden />
                Effective rate
              </p>
              <p className="text-xl font-semibold text-[var(--stage-text-primary)] tracking-tight tabular-nums">
                {ledger.fmt.effectiveHourlyRate}
              </p>
            </div>
            {ledger.eventHours != null && (
              <p className="text-xs text-[var(--stage-text-secondary)] tabular-nums">
                {ledger.eventHours}h event
              </p>
            )}
          </div>
        </StagePanel>
      )}

      {/* Transaction stream */}
      <StagePanel elevated className="p-6 rounded-[var(--stage-radius-panel)] border-l-4 border-l-[var(--color-unusonic-error)]">
        <h2 className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-4">
          Transaction stream
        </h2>
        {ledger && ledger.transactions.length > 0 ? (
          <ul className="space-y-2">
            {ledger.transactions.map((tx) => (
              <li
                key={tx.id}
                className="flex items-center gap-3 py-2 border-b border-[oklch(1_0_0_/_0.08)] last:border-0 text-sm"
              >
                {tx.inbound ? (
                  <ArrowDownRight size={16} strokeWidth={1.5} className="shrink-0 text-[var(--color-unusonic-success)]" aria-hidden />
                ) : (
                  <ArrowUpRight size={16} strokeWidth={1.5} className="shrink-0 text-[var(--stage-text-secondary)]" aria-hidden />
                )}
                <span className="text-[var(--stage-text-primary)]">{tx.label}</span>
                <span className="tabular-nums text-[var(--stage-text-secondary)]">
                  — {tx.amount < 0 ? '-' : ''}${Math.abs(tx.amount).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="ml-auto text-[var(--stage-text-secondary)] text-xs">
                  {tx.status ?? (tx.date ? new Date(tx.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '—')}
                </span>
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-sm text-[var(--stage-text-secondary)] py-2">No transactions recorded yet.</p>
        )}
        <p className="text-xs text-[var(--stage-text-secondary)] mt-4">
          Open finance for full P&amp;L and invoices.
        </p>
      </StagePanel>

      <Link
        href={`/events/${eventId}/finance`}
        className="inline-flex items-center gap-2 px-4 py-3 rounded-full border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-primary)] font-medium text-sm hover:bg-[var(--stage-surface-hover)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]"
      >
        <Wallet size={18} strokeWidth={1.5} aria-hidden />
        Open finance
      </Link>
    </motion.div>
  );
}
