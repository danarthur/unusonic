'use client';

/**
 * PromotedMetricsRow — the few inline metrics that earn header placement.
 *
 * Person:
 *   Shows: 12 · Last show: Jun '25 · Hale wedding · Rate: $450 / 4 hrs
 *
 * Company / venue:
 *   Team: 5 · Deals: 12 open · 34 past
 *
 * Renders a compact, tabular-nums row. Single-purpose — don't bloat with more
 * metrics. See docs/reference/network-page-ia-redesign.md §10.
 */

import * as React from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import {
  getPromotedMetrics,
  type PromotedMetrics,
} from '../api/get-promoted-metrics';
import { formatRelative } from '@/shared/lib/format-relative';
import { InlineField } from '@/shared/ui/inline-field';
import { setPersonRate } from '@/features/network-data/api/set-person-rate';

export interface PromotedMetricsRowProps {
  workspaceId: string;
  entityId: string;
  entityType: 'person' | 'company' | 'venue' | 'couple';
  className?: string;
}

export function PromotedMetricsRow({
  workspaceId,
  entityId,
  entityType,
  className,
}: PromotedMetricsRowProps) {
  const { data } = useQuery({
    queryKey: ['entity-promoted-metrics', workspaceId, entityId, entityType],
    queryFn: () => getPromotedMetrics(workspaceId, entityId, entityType),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });

  const queryClient = useQueryClient();
  const invalidate = React.useCallback(() => {
    void queryClient.invalidateQueries({
      queryKey: ['entity-promoted-metrics', workspaceId, entityId, entityType],
    });
  }, [queryClient, workspaceId, entityId, entityType]);

  const metrics = data && 'ok' in data && data.ok ? data.metrics : null;
  if (!metrics) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={STAGE_LIGHT}
      className={cn(
        'flex items-center gap-4 font-mono tabular-nums',
        'text-[11px] text-[var(--stage-text-secondary)]',
        className,
      )}
    >
      {metrics.kind === 'person' ? (
        <PersonCells metrics={metrics} entityId={entityId} onRateSaved={invalidate} />
      ) : metrics.kind === 'venue' ? (
        <VenueCells metrics={metrics} />
      ) : (
        <CompanyCells metrics={metrics} />
      )}
    </motion.div>
  );
}

function VenueCells({
  metrics,
}: {
  metrics: Extract<PromotedMetrics, { kind: 'venue' }>;
}) {
  return (
    <>
      <Cell
        label="Shows hosted"
        value={metrics.showsHostedCount.toString()}
        muted={metrics.showsHostedCount === 0}
      />
      <Cell
        label="Last contact"
        value={metrics.lastContactAt ? formatRelative(metrics.lastContactAt) : '—'}
        muted={!metrics.lastContactAt}
      />
    </>
  );
}

function PersonCells({
  metrics,
  entityId,
  onRateSaved,
}: {
  metrics: Extract<PromotedMetrics, { kind: 'person' }>;
  entityId: string;
  onRateSaved: () => void;
}) {
  const { lastShow, nextShow, rate } = metrics;
  return (
    <>
      <Cell
        label="Shows"
        value={metrics.showCount.toString()}
        muted={metrics.showCount === 0}
      />
      {/* Named, not just dated. Memory here is show-shaped -- "the Hale
          wedding", not "June" -- so the title is the retrieval key, and it is
          also how you tell a real record from an invented one. */}
      <Cell
        label="Last show"
        value={lastShow ? formatShow(lastShow) : '—'}
        muted={!lastShow}
      />
      {/* Only when there is one. The strip could say when somebody was last out
          and not when they are next, which is the question actually asked
          before picking up the phone -- but a cell reading "—" for everyone
          without a booking is four characters of nothing on every record. */}
      {nextShow && (
        <Cell label="Next show" value={formatShow(nextShow)} muted={false} />
      )}
      {/* The one number here you would want to change while looking at it, and
          the cell used to vanish entirely when it was empty -- which is exactly
          when you want somewhere to put it. It stays, and says so. */}
      <span className="inline-flex items-baseline gap-1">
        <span className="text-[10px] uppercase tracking-wider text-[var(--stage-text-secondary)]">
          Rate
        </span>
        <InlineField
          value={rate ? String(rate.amount) : null}
          display={`$${rate?.amount.toLocaleString('en-US') ?? ''}${rate?.unit ? ` / ${rate.unit}` : ''}`}
          label="Rate"
          emptyLabel="Add"
          placeholder="450"
          inputMode="decimal"
          onCommit={async (next) => {
            const amount = next === null ? null : Number(next.replace(/[$,\s]/g, ''));
            if (amount !== null && !Number.isFinite(amount)) {
              return { ok: false as const, error: 'That does not look like a rate.' };
            }
            const result = await setPersonRate(entityId, amount);
            if (result.ok) onRateSaved();
            return result;
          }}
          inputClassName="w-20"
          className="px-1 -mx-1 text-[var(--stage-text-primary)]"
        />
      </span>
    </>
  );
}

/** "Jun '25 · Hale wedding", or just the date when the show has no title. */
function formatShow(show: { title: string | null; date: string | null }): string {
  const when = show.date
    ? new Date(show.date).toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
        // A show date stored as a plain calendar date would otherwise read a
        // day early anywhere west of Greenwich.
        timeZone: show.date.length === 10 ? 'UTC' : undefined,
      })
    : null;
  return [when, show.title].filter(Boolean).join(' · ') || '—';
}

function CompanyCells({
  metrics,
}: {
  metrics: Extract<PromotedMetrics, { kind: 'company' }>;
}) {
  return (
    <>
      <Cell
        label="Team"
        value={metrics.teamCount.toString()}
        muted={metrics.teamCount === 0}
      />
      <Cell
        label="Deals"
        value={
          metrics.openDealsCount === 0 && metrics.pastDealsCount === 0
            ? '—'
            : `${metrics.openDealsCount} open · ${metrics.pastDealsCount} past`
        }
        muted={metrics.openDealsCount === 0 && metrics.pastDealsCount === 0}
      />
    </>
  );
}

function Cell({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted: boolean;
}) {
  return (
    <span className="inline-flex items-baseline gap-1">
      <span className="text-[10px] uppercase tracking-wider text-[var(--stage-text-secondary)]">
        {label}
      </span>
      <span className={muted ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--stage-text-primary)]'}>
        {value}
      </span>
    </span>
  );
}

