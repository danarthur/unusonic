'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Calendar, Briefcase, Receipt } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import {
  getEntityDeals,
  getEntityFinancialSummary,
  type EntityDeal,
  type EntityInvoiceSummary,
} from '@/features/network-data/api/entity-context-actions';
import { getEntityCrewSchedule, getEntityCrewHistory, type CrewScheduleEntry } from '@/features/ops/actions/get-entity-crew-schedule';

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
    <div className="stage-panel rounded-2xl overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left hover:bg-[oklch(1_0_0/0.08)] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        <span className="flex items-center gap-2 text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          <Icon className="size-3.5" />
          {label}
        </span>
        <ChevronDown className={cn('size-4 transition-transform', open && 'rotate-180')} />
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
            <div className="px-5 pb-5 pt-1 space-y-4 border-t border-[oklch(1_0_0_/_0.08)]">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function AssignmentRow({ entry, muted = false }: { entry: CrewScheduleEntry; muted?: boolean }) {
  return (
    <li className="flex items-start gap-3 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-card)] px-3 py-2.5">
      <div className="min-w-0 flex-1">
        <p className={cn('text-sm font-medium truncate', muted ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--stage-text-primary)]')}>
          {entry.event_title ?? 'Untitled show'}
        </p>
        <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
          {entry.role}
          {entry.starts_at ? ` · ${new Date(entry.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
          {entry.venue_name ? ` · ${entry.venue_name}` : ''}
        </p>
      </div>
      <span className={cn(
        'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
        muted
          ? 'bg-[oklch(1_0_0_/_0.05)] text-[var(--stage-text-secondary)]/60'
          : entry.status === 'confirmed'
            ? 'bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)]'
            : entry.status === 'dispatched'
              ? 'bg-[oklch(1_0_0/0.10)] text-[var(--stage-text-primary)]'
              : 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
      )}>
        {entry.status}
      </span>
    </li>
  );
}

export function AssignmentsPanel({ entityId }: { entityId: string }) {
  const [upcoming, setUpcoming] = React.useState<CrewScheduleEntry[] | null>(null);
  const [history, setHistory] = React.useState<CrewScheduleEntry[] | null>(null);
  const [loading, setLoading] = React.useState(true);
  const [showPast, setShowPast] = React.useState(false);

  React.useEffect(() => {
    setLoading(true);
    Promise.all([
      getEntityCrewSchedule(entityId),
      getEntityCrewHistory(entityId),
    ]).then(([upcomingData, historyData]) => {
      setUpcoming(upcomingData);
      setHistory(historyData);
      setLoading(false);
    });
  }, [entityId]);

  if (loading) return (
    <AccordionSection label="Assignments" icon={Calendar}>
      <div className="space-y-2">
        <div className="h-8 rounded-lg bg-[oklch(1_0_0_/_0.05)] stage-skeleton" />
        <div className="h-8 rounded-lg bg-[oklch(1_0_0_/_0.05)] stage-skeleton" />
      </div>
    </AccordionSection>
  );
  if ((!upcoming || upcoming.length === 0) && (!history || history.length === 0)) return null;

  return (
    <AccordionSection label="Assignments" icon={Calendar}>
      <div className="space-y-4">
        {upcoming && upcoming.length > 0 && (
          <div>
            <p className="mb-2 text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
              Upcoming
            </p>
            <ul className="space-y-2">
              {upcoming.map((entry) => (
                <AssignmentRow key={entry.assignment_id} entry={entry} />
              ))}
            </ul>
          </div>
        )}

        {history && history.length > 0 && (
          <div>
            <button
              type="button"
              onClick={() => setShowPast((p) => !p)}
              className="mb-2 flex items-center gap-1.5 text-[10px] font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
            >
              <ChevronDown className={cn('size-3 transition-transform', showPast && 'rotate-180')} />
              {showPast ? 'Hide history' : `Show history (${history.length})`}
            </button>
            {showPast && (
              <ul className="space-y-2">
                {history.map((entry) => (
                  <AssignmentRow key={entry.assignment_id} entry={entry} muted />
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </AccordionSection>
  );
}

export function DealsPanel({ entityId }: { entityId: string }) {
  const [data, setData] = React.useState<EntityDeal[] | null>(null);
  const [loading, setLoading] = React.useState(true);

  React.useEffect(() => {
    setLoading(true);
    getEntityDeals(entityId).then((d) => { setData(d); setLoading(false); });
  }, [entityId]);

  if (loading) return (
    <AccordionSection label="Related deals" icon={Briefcase}>
      <div className="h-8 rounded-lg bg-[oklch(1_0_0_/_0.05)] stage-skeleton" />
    </AccordionSection>
  );
  if (!data || data.length === 0) return null;

  return (
    <AccordionSection label="Related deals" icon={Briefcase}>
      <ul className="space-y-2">
        {data.map((deal) => (
          <li key={deal.id} className="flex items-center gap-3 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-card)] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--stage-text-primary)] capitalize">
                {deal.event_archetype?.replace(/_/g, ' ') ?? 'Deal'}
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
                {new Date(deal.proposed_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                {deal.budget_estimated ? ` · $${deal.budget_estimated.toLocaleString()}` : ''}
              </p>
            </div>
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
              deal.status === 'confirmed' && 'bg-[var(--color-unusonic-success)]/15 text-[var(--color-unusonic-success)]',
              deal.status === 'signed' && 'bg-[oklch(1_0_0/0.10)] text-[var(--stage-text-primary)]',
              deal.status === 'prospect' && 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
              !['confirmed','signed','prospect'].includes(deal.status) && 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
            )}>
              {deal.status}
            </span>
          </li>
        ))}
      </ul>
    </AccordionSection>
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
      <div className="h-8 rounded-lg bg-[oklch(1_0_0_/_0.05)] stage-skeleton" />
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
          <p className="text-xs text-[var(--stage-text-secondary)]">Outstanding</p>
          <p className="text-lg font-semibold text-[var(--color-unusonic-warning)]">
            ${totalOutstanding.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>
      )}
      <ul className="space-y-2">
        {data.map((inv) => (
          <li key={inv.id} className="flex items-center gap-3 rounded-lg border border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-card)] px-3 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-medium text-[var(--stage-text-primary)]">
                ${(inv.total_amount ?? 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
              {inv.due_date && (
                <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
                  Due {new Date(inv.due_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                </p>
              )}
            </div>
            <span className={cn(
              'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide',
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
