'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { TrendingUp, Calendar, MapPin, DollarSign, ChevronDown } from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

/* ── Types ───────────────────────────────────────────────────────── */

interface Deal {
  id: string;
  title: string | null;
  status: string;
  proposedDate: string | null;
  budgetEstimated: number | null;
  eventArchetype: string | null;
  venueName: string | null;
  clientName: string | null;
  leadSource: string | null;
  wonAt: string | null;
  lostAt: string | null;
  createdAt: string;
}

interface PipelineViewProps {
  deals: Deal[];
}

/* ── Helpers ──────────────────────────────────────────────────────── */

const STATUS_ORDER = ['inquiry', 'qualifying', 'proposal_sent', 'negotiating', 'won', 'lost'];

const STATUS_LABELS: Record<string, string> = {
  inquiry: 'Inquiry',
  qualifying: 'Qualifying',
  proposal_sent: 'Proposal sent',
  negotiating: 'Negotiating',
  won: 'Won',
  lost: 'Lost',
};

const STATUS_STYLES: Record<string, string> = {
  inquiry: 'bg-[oklch(0.75_0.12_250/0.2)] text-[oklch(0.75_0.12_250)]',
  qualifying: 'bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]',
  proposal_sent: 'bg-[oklch(0.75_0.12_200/0.2)] text-[oklch(0.75_0.12_200)]',
  negotiating: 'bg-[oklch(0.75_0.15_55/0.2)] text-[oklch(0.75_0.15_55)]',
  won: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
  lost: 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-tertiary)]',
};

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function formatDate(iso: string | null): string {
  if (!iso) return '';
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ── Component ───────────────────────────────────────────────────── */

export function PipelineView({ deals }: PipelineViewProps) {
  const [showClosed, setShowClosed] = useState(false);

  if (deals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <TrendingUp className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No deals in your pipeline yet. Deals assigned to you will appear here.
        </p>
      </div>
    );
  }

  // Split into active and closed
  const active = deals.filter(d => !['won', 'lost'].includes(d.status));
  const closed = deals.filter(d => ['won', 'lost'].includes(d.status));

  // Group active by status
  const grouped = new Map<string, Deal[]>();
  for (const deal of active) {
    const list = grouped.get(deal.status) ?? [];
    list.push(deal);
    grouped.set(deal.status, list);
  }

  // Summary stats
  const totalActive = active.length;
  const totalValue = active.reduce((sum, d) => sum + (d.budgetEstimated ?? 0), 0);
  const wonCount = closed.filter(d => d.status === 'won').length;
  const wonValue = closed.filter(d => d.status === 'won').reduce((sum, d) => sum + (d.budgetEstimated ?? 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      {/* Summary card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active deals" value={String(totalActive)} />
        <StatCard label="Pipeline value" value={totalValue > 0 ? formatCurrency(totalValue) : '$0'} />
        <StatCard label="Won" value={String(wonCount)} />
        <StatCard label="Won value" value={wonValue > 0 ? formatCurrency(wonValue) : '$0'} />
      </div>

      {/* Active deals by status */}
      {STATUS_ORDER.filter(s => !['won', 'lost'].includes(s)).map(status => {
        const statusDeals = grouped.get(status);
        if (!statusDeals || statusDeals.length === 0) return null;
        return (
          <section key={status} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
                {STATUS_LABELS[status] ?? status}
              </h2>
              <span className="text-xs text-[var(--stage-text-tertiary)]">{statusDeals.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {statusDeals.map(deal => (
                <DealCard key={deal.id} deal={deal} />
              ))}
            </div>
          </section>
        );
      })}

      {/* Closed deals (collapsed by default) */}
      {closed.length > 0 && (
        <div>
          <button
            onClick={() => setShowClosed(!showClosed)}
            className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] transition-colors"
          >
            <ChevronDown className={`size-3.5 transition-transform ${showClosed ? 'rotate-180' : ''}`} />
            Closed ({closed.length})
          </button>
          <AnimatePresence>
            {showClosed && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                className="flex flex-col gap-2 mt-2 overflow-hidden"
              >
                {closed.map(deal => (
                  <DealCard key={deal.id} deal={deal} />
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </motion.div>
  );
}

/* ── Stat Card ───────────────────────────────────────────────────── */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1 p-3 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
      <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">{label}</span>
      <span className="text-lg font-semibold tracking-tight text-[var(--stage-text-primary)]">{value}</span>
    </div>
  );
}

/* ── Deal Card ───────────────────────────────────────────────────── */

function DealCard({ deal }: { deal: Deal }) {
  return (
    <div className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
            {deal.title ?? 'Untitled deal'}
          </h3>
          {deal.clientName && (
            <p className="text-xs text-[var(--stage-text-tertiary)] mt-0.5">{deal.clientName}</p>
          )}
        </div>
        <span className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${STATUS_STYLES[deal.status] ?? STATUS_STYLES.inquiry}`}>
          {STATUS_LABELS[deal.status] ?? deal.status}
        </span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--stage-text-tertiary)]">
        {deal.proposedDate && (
          <span className="flex items-center gap-1">
            <Calendar className="size-3" />
            {formatDate(deal.proposedDate)}
          </span>
        )}
        {deal.venueName && (
          <span className="flex items-center gap-1">
            <MapPin className="size-3" />
            {deal.venueName}
          </span>
        )}
        {deal.budgetEstimated && (
          <span className="flex items-center gap-1">
            <DollarSign className="size-3" />
            {formatCurrency(deal.budgetEstimated)}
          </span>
        )}
        {deal.eventArchetype && (
          <span>{deal.eventArchetype}</span>
        )}
      </div>
    </div>
  );
}
