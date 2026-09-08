'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Receipt } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import {
  getEntityFinancialSummary,
  type EntityInvoiceSummary,
} from '@/features/network-data/api/entity-context-actions';

export function AccordionSection({
  label,
  icon: Icon,
  defaultOpen = false,
  children,
}: {
  label: string;
  icon: React.ElementType;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="stage-panel rounded-2xl overflow-hidden" data-surface="surface">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[oklch(1_0_0/0.08)] transition-colors duration-[80ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] ring-offset-2 ring-offset-[var(--stage-void)]"
      >
        <span className="flex items-center gap-2 stage-label">
          <Icon className="size-3.5" strokeWidth={1.5} />
          {label}
        </span>
        <motion.div animate={{ rotate: open ? 180 : 0 }} transition={STAGE_MEDIUM}>
          <ChevronDown className="size-4 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
        </motion.div>
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-[var(--stage-edge-subtle)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function FinancePanel({ entityId }: { entityId: string }) {
  const [data, setData] = React.useState<EntityInvoiceSummary[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    getEntityFinancialSummary(entityId).then((d) => { setData(d); setLoading(false); });
  }, [entityId]);

  if (loading) return (
    <AccordionSection label="Financial obligations" icon={Receipt}>
      <div className="h-8 rounded-lg bg-[oklch(1_0_0/0.08)] stage-skeleton" />
    </AccordionSection>
  );
  if (!data || data.length === 0) return null;

  const totalOutstanding = data
    .filter((inv) => inv.status !== 'paid' && inv.status !== 'void')
    .reduce((sum, inv) => sum + (inv.total_amount ?? 0), 0);

  return (
    <AccordionSection label="Financial obligations" icon={Receipt}>
      {totalOutstanding > 0 && (
        <div className="rounded-lg border-l-[3px] border-l-[var(--color-unusonic-warning)] bg-[var(--stage-surface)] px-3 py-2 mb-3">
          <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">Outstanding</p>
          <p className="stage-readout-lg text-[var(--color-unusonic-warning)]">
            ${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      )}
      <ul className="space-y-2">
        {data.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3 rounded-lg border border-[var(--stage-edge-subtle)] bg-[var(--ctx-card)] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="stage-readout-sm text-[var(--stage-text-primary)]">
                ${(inv.total_amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {inv.due_date && (
                <p className="text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)] mt-0.5">
                  Due {new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 stage-badge-text uppercase tracking-wide',
              inv.status === 'paid' && 'bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)]',
              inv.status === 'overdue' && 'bg-[var(--color-unusonic-error)]/15 text-[var(--color-unusonic-error)]',
              inv.status === 'sent' && 'bg-[oklch(1_0_0/0.10)] text-[var(--stage-text-primary)]',
              !['paid','overdue','sent'].includes(inv.status ?? '') && 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
            )}>
              {inv.status ?? 'draft'}
            </span>
          </li>
        ))}
      </ul>
    </AccordionSection>
  );
}
