'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown } from 'lucide-react';
import { getEntityDeals, type EntityDeal } from '@/features/network-data/api/entity-context-actions';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';

const PAST_STATUSES = new Set(['lost', 'won']);
const MAX_ACTIVE_VISIBLE = 5;

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

function stageBadgeLabel(status: string): string {
  return status.replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());
}

function DealRow({ deal }: { deal: EntityDeal }) {
  return (
    <div className="flex items-center justify-between gap-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
          {deal.event_archetype
            ? `${stageBadgeLabel(deal.event_archetype)}${deal.proposed_date ? ` — ${new Date(deal.proposed_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}`
            : deal.proposed_date
              ? new Date(deal.proposed_date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
              : 'Untitled deal'}
        </p>
        <span className="stage-badge-text px-2 py-0.5 rounded-full bg-[oklch(1_0_0/0.06)] text-[var(--stage-text-secondary)] inline-block mt-1">
          {stageBadgeLabel(deal.status)}
        </span>
      </div>
      {deal.budget_estimated != null && (
        <span className="shrink-0 text-[length:var(--stage-data-size)] font-mono tabular-nums text-[var(--stage-text-secondary)]">
          {formatCurrency(deal.budget_estimated)}
        </span>
      )}
    </div>
  );
}

function SkeletonRow() {
  return (
    <div className="flex items-center justify-between gap-3 py-2 animate-pulse">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="h-4 w-3/4 rounded bg-[var(--stage-surface-elevated)]" />
        <div className="h-4 w-16 rounded-full bg-[var(--stage-surface-elevated)]" />
      </div>
      <div className="h-4 w-16 rounded bg-[var(--stage-surface-elevated)]" />
    </div>
  );
}

export function DealHistoryPanel({ entityId }: { entityId: string }) {
  const [deals, setDeals] = React.useState<EntityDeal[] | null>(null);
  const [pastExpanded, setPastExpanded] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    setDeals(null);
    setPastExpanded(false);
    getEntityDeals(entityId).then((result) => {
      if (!cancelled) setDeals(result);
    });
    return () => { cancelled = true; };
  }, [entityId]);

  const activeDeals = React.useMemo(
    () => (deals ?? []).filter((d) => !PAST_STATUSES.has(d.status)),
    [deals],
  );
  const pastDeals = React.useMemo(
    () => (deals ?? []).filter((d) => PAST_STATUSES.has(d.status)),
    [deals],
  );

  // Loading
  if (deals === null) {
    return (
      <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
        <h3 className="stage-label text-[var(--stage-text-secondary)] mb-3">
          Deals
        </h3>
        <div className="divide-y divide-[var(--stage-edge-subtle)]">
          <SkeletonRow />
          <SkeletonRow />
          <SkeletonRow />
        </div>
      </div>
    );
  }

  // Empty
  if (deals.length === 0) {
    return (
      <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
        <h3 className="stage-label text-[var(--stage-text-secondary)] mb-2">
          Deals
        </h3>
        <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)]">No deals</p>
      </div>
    );
  }

  const visibleActive = activeDeals.slice(0, MAX_ACTIVE_VISIBLE);
  const hiddenActiveCount = activeDeals.length - MAX_ACTIVE_VISIBLE;

  return (
    <div className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4" data-surface="elevated">
      {/* Active deals */}
      {activeDeals.length > 0 && (
        <>
          <h3 className="stage-label text-[var(--stage-text-secondary)] mb-1">
            Active deals
          </h3>
          <div className="divide-y divide-[var(--stage-edge-subtle)]">
            {visibleActive.map((deal) => (
              <DealRow key={deal.id} deal={deal} />
            ))}
          </div>
          {hiddenActiveCount > 0 && (
            <p className="mt-1 text-[length:var(--stage-label-size)] text-[var(--stage-text-secondary)]">
              +{hiddenActiveCount} more
            </p>
          )}
        </>
      )}

      {/* Past deals — collapsible */}
      {pastDeals.length > 0 && (
        <div className={activeDeals.length > 0 ? 'mt-3 pt-3 border-t border-[var(--stage-edge-subtle)]' : ''}>
          <button
            type="button"
            onClick={() => setPastExpanded((v) => !v)}
            className="flex w-full items-center justify-between stage-label text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
          >
            <span>Past deals ({pastDeals.length})</span>
            <motion.span
              animate={{ rotate: pastExpanded ? 180 : 0 }}
              transition={STAGE_MEDIUM}
            >
              <ChevronDown className="size-4" strokeWidth={1.5} />
            </motion.span>
          </button>
          <AnimatePresence initial={false}>
            {pastExpanded && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={STAGE_MEDIUM}
                className="overflow-hidden"
              >
                <div className="divide-y divide-[var(--stage-edge-subtle)] pt-1">
                  {pastDeals.map((deal) => (
                    <DealRow key={deal.id} deal={deal} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}

      {/* Edge case: only past deals, no active */}
      {activeDeals.length === 0 && pastDeals.length > 0 && !pastExpanded && (
        <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)] mt-2">No active deals</p>
      )}
    </div>
  );
}
