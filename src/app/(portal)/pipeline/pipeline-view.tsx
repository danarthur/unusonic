'use client';

import { format } from 'date-fns';
import { motion } from 'framer-motion';
import { TrendingUp, Calendar, MapPin, DollarSign, Check } from 'lucide-react';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import type { WorkspacePipelineStage } from '@/app/(dashboard)/(features)/crm/actions/get-workspace-pipeline-stages';

/* ── Types ───────────────────────────────────────────────────────── */

interface Deal {
  id: string;
  title: string | null;
  status: string;
  stageId: string | null;
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
  stages: WorkspacePipelineStage[];
}

/* ── Helpers ──────────────────────────────────────────────────────── */

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
  return format(new Date(iso), 'MMM d, yyyy');
}

/**
 * Style per stage kind. Working stages share a neutral badge; won stages use
 * the positive-status style. Lost stages are hidden upstream so no style here.
 */
const KIND_STYLES: Record<WorkspacePipelineStage['kind'], string> = {
  working: 'bg-[oklch(0.75_0.12_250/0.2)] text-[oklch(0.75_0.12_250)]',
  won: 'bg-[oklch(0.75_0.15_145/0.2)] text-[oklch(0.75_0.15_145)]',
  lost: 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-tertiary)]',
};

/* ── Component ───────────────────────────────────────────────────── */

export function PipelineView({ deals, stages }: PipelineViewProps) {
  // Filter stages to what the portal should render: not hidden, not lost.
  const visibleStages = stages
    .filter((s) => !s.hide_from_portal && s.kind !== 'lost')
    .sort((a, b) => a.sort_order - b.sort_order);

  const visibleStageIds = new Set(visibleStages.map((s) => s.id));
  const stageById = new Map(visibleStages.map((s) => [s.id, s]));

  // Drop deals whose stage_id isn't in the visible list (hidden or lost).
  const visibleDeals = deals.filter((d) => d.stageId && visibleStageIds.has(d.stageId));

  // Empty state: no default pipeline configured for the workspace.
  if (stages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <TrendingUp className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          Your workspace doesn&apos;t have a pipeline configured yet.
        </p>
      </div>
    );
  }

  // Empty state: admin has hidden every stage from the portal.
  if (visibleStages.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <TrendingUp className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No pipeline stages are visible in the portal yet. Ask your admin to make stages visible.
        </p>
      </div>
    );
  }

  // Empty state: user has no deals (or all of them are in hidden/lost stages).
  if (visibleDeals.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 gap-3 text-center">
        <TrendingUp className="size-10 text-[var(--stage-text-tertiary)]" />
        <p className="text-sm text-[var(--stage-text-secondary)]">
          No deals in your pipeline yet. Deals assigned to you will appear here.
        </p>
      </div>
    );
  }

  // Group visible deals by stage_id.
  const grouped = new Map<string, Deal[]>();
  for (const deal of visibleDeals) {
    if (!deal.stageId) continue;
    const list = grouped.get(deal.stageId) ?? [];
    list.push(deal);
    grouped.set(deal.stageId, list);
  }

  // Summary stats.
  const workingDeals = visibleDeals.filter((d) => {
    const stage = d.stageId ? stageById.get(d.stageId) : null;
    return stage?.kind === 'working';
  });
  const wonDeals = visibleDeals.filter((d) => {
    const stage = d.stageId ? stageById.get(d.stageId) : null;
    return stage?.kind === 'won';
  });

  const totalActive = workingDeals.length;
  const totalValue = workingDeals.reduce((sum, d) => sum + (d.budgetEstimated ?? 0), 0);
  const wonCount = wonDeals.length;
  const wonValue = wonDeals.reduce((sum, d) => sum + (d.budgetEstimated ?? 0), 0);

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      <h1 className="sr-only">Pipeline</h1>
      {/* Summary card */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Active deals" value={String(totalActive)} />
        <StatCard label="Pipeline value" value={totalValue > 0 ? formatCurrency(totalValue) : '$0'} />
        <StatCard label="Won" value={String(wonCount)} />
        <StatCard label="Won value" value={wonValue > 0 ? formatCurrency(wonValue) : '$0'} />
      </div>

      {/* One section per visible stage, in sort_order. */}
      {visibleStages.map((stage) => {
        const stageDeals = grouped.get(stage.id);
        if (!stageDeals || stageDeals.length === 0) return null;
        return (
          <section key={stage.id} className="flex flex-col gap-2">
            <div className="flex items-center justify-between">
              <h2 className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-tertiary)]">
                {stage.label}
              </h2>
              <span className="text-xs text-[var(--stage-text-tertiary)]">{stageDeals.length}</span>
            </div>
            <div className="flex flex-col gap-2">
              {stageDeals.map((deal) => (
                <DealCard key={deal.id} deal={deal} stage={stage} />
              ))}
            </div>
          </section>
        );
      })}
    </motion.div>
  );
}

/* ── Stat Card ───────────────────────────────────────────────────── */

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div data-surface="elevated" className="flex flex-col gap-1 p-3 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface-elevated)]">
      <span className="stage-label text-[var(--stage-text-tertiary)]">{label}</span>
      <span className="text-lg font-semibold tracking-tight text-[var(--stage-text-primary)]">{value}</span>
    </div>
  );
}

/* ── Deal Card ───────────────────────────────────────────────────── */

function DealCard({ deal, stage }: { deal: Deal; stage: WorkspacePipelineStage }) {
  const badgeStyle = KIND_STYLES[stage.kind] ?? KIND_STYLES.working;
  return (
    <div data-surface="elevated" className="flex flex-col gap-2 p-4 rounded-xl border border-[oklch(1_0_0/0.06)] bg-[var(--stage-surface-elevated)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-[var(--stage-text-primary)] truncate">
            {deal.title ?? 'Untitled deal'}
          </h3>
          {deal.clientName && (
            <p className="text-xs text-[var(--stage-text-tertiary)] mt-0.5">{deal.clientName}</p>
          )}
        </div>
        <span className={`inline-flex items-center gap-1 stage-badge-text px-2 py-0.5 rounded-full shrink-0 ${badgeStyle}`}>
          {stage.kind === 'won' && <Check className="size-2.5" />}
          {stage.label}
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
