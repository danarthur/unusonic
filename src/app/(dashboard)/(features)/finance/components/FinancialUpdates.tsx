'use client';

import Link from 'next/link';
import { motion } from 'framer-motion';
import { StagePanel } from '@/shared/ui/stage-panel';
import { cn } from '@/shared/lib/utils';
import {
  M3_FADE_THROUGH_ENTER,
  M3_SHARED_AXIS_Y_VARIANTS,
  M3_STAGGER_CHILDREN,
  M3_STAGGER_DELAY,
} from '@/shared/lib/motion-constants';
import { useFinanceData, type FinanceRow } from '@/widgets/global-pulse/lib/use-finance-data';

export function FinancialUpdates() {
  const { data: invoices, loading, error } = useFinanceData();

  return (
    <div className="w-full space-y-4">
      {/* Header - Matching your 'Telemetry' style */}
      <div className="flex items-center justify-between">
        <h3 className="text-xs font-medium font-mono text-[var(--stage-text-secondary)] uppercase tracking-widest">
          Cash Flow
        </h3>
        <span className="flex h-1.5 w-1.5 items-center justify-center">
          <span className="absolute inline-flex h-1.5 w-1.5 animate-ping rounded-full bg-[var(--color-unusonic-success)] opacity-75" />
          <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-[var(--color-unusonic-success)]" />
        </span>
      </div>

      {/* Content Card */}
      <div className="flex flex-col gap-2">
        {loading ? (
          <StagePanel className="h-24 w-full stage-skeleton !p-0" padding="none" />
        ) : error ? (
          <div className="py-6 text-center text-xs text-[var(--stage-text-secondary)] italic leading-relaxed">
            {error}
          </div>
        ) : invoices.length === 0 ? (
          <div className="py-6 text-center text-xs text-[var(--stage-text-secondary)] italic leading-relaxed">
            No active invoices
          </div>
        ) : (
          <motion.div
            className="flex flex-col gap-2"
            initial="hidden"
            animate="visible"
            variants={{
              visible: {
                transition: {
                  staggerChildren: M3_STAGGER_CHILDREN,
                  delayChildren: M3_STAGGER_DELAY,
                },
              },
              hidden: {},
            }}
          >
            {invoices.map((inv) => (
              <motion.div
                key={inv.id}
                variants={M3_SHARED_AXIS_Y_VARIANTS}
                transition={M3_FADE_THROUGH_ENTER}
              >
                <StagePanel
                  interactive
                  nested
                  className="group relative flex cursor-pointer items-center justify-between !p-3 transition-all"
                >
                  <div className="flex flex-col">
                    <span className="font-medium text-sm text-[var(--stage-text-primary)] group-hover:text-[var(--stage-text-primary)]">
                      {inv.client_name || 'Client Payment'}
                    </span>
                    <span className="font-mono text-[10px] text-[var(--stage-text-secondary)] leading-relaxed">
                      {inv.invoice_number ? `INV-${inv.invoice_number.slice(0, 5)}` : 'INV-00000'}
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs font-medium text-[var(--stage-text-primary)]">
                      ${inv.amount?.toLocaleString() ?? '0'}
                    </span>
                    <StatusDot status={inv.status || 'draft'} />
                  </div>
                </StagePanel>
              </motion.div>
            ))}
          </motion.div>
        )}
      </div>

      {/* Footer Action */}
      <Link href="/finance" className="block w-full">
        <motion.button
          type="button"
          transition={M3_FADE_THROUGH_ENTER}
          className="w-full stage-btn stage-btn-secondary text-[10px] uppercase tracking-wider hover:brightness-[1.03] transition-[filter]"
        >
          View Ledger
        </motion.button>
      </Link>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const colors: Record<string, string> = {
    paid: 'bg-[var(--color-unusonic-success)]',
    sent: 'bg-[var(--color-unusonic-warning)]',
    overdue: 'bg-unusonic-error',
    draft: 'bg-[var(--stage-surface-elevated)]',
  };
  const color = colors[status] ?? colors.draft;
  return <div className={cn('h-1.5 w-1.5 rounded-full', color)} />;
}