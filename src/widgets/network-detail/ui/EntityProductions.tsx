'use client';

/**
 * EntityProductions — three-band productions list for any entity.
 *
 * One component for what used to be three: this for people in the panel,
 * DealHistoryPanel for companies in the panel, and DealsPanel on the page.
 * They read from two different server actions with different coverage, so a
 * company's history was shorter on one surface than another. There is one
 * reader now, and these bands everywhere.
 *
 * Bands match the production-company owner's mental model:
 *   • In play — pre-contract (what am I waiting on)
 *   • Booked  — signed + future-dated (what we're delivering)
 *   • Past    — completed (history, collapsed)
 *
 * Each row shows: title, date, role, status badge, optional amount, deep-link
 * to the production in the CRM with `?from=` smart-back encoding.
 *
 * summary caps the past band for the panel; full opens it on the page, where
 * depth is the point.
 *
 * Design: docs/reference/network-page-ia-redesign.md §4.2.
 */

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUpRight, Briefcase, CalendarCheck2, Clock, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { queryKeys } from '@/shared/api/query-keys';
import { withFrom } from '@/shared/lib/smart-back';
import { useCurrentHref } from '@/shared/lib/smart-back-client';
import { getEntityProductions } from '../api/get-entity-productions';
import type { EntityProduction, ProductionBand } from '../api/entity-productions-shape';

export interface EntityProductionsProps {
  workspaceId: string;
  entityId: string;
  /** summary = the panel's capped peek; full = the page's complete list. */
  variant?: 'summary' | 'full';
}

const BAND_LABEL: Record<ProductionBand, string> = {
  in_play: 'In play',
  booked: 'Booked',
  past: 'Past',
};

const BAND_ICON: Record<ProductionBand, typeof Briefcase> = {
  in_play: Briefcase,
  booked: CalendarCheck2,
  past: Clock,
};

function groupByBand(productions: EntityProduction[]): Record<ProductionBand, EntityProduction[]> {
  const byBand: Record<ProductionBand, EntityProduction[]> = { in_play: [], booked: [], past: [] };
  for (const p of productions) byBand[p.band].push(p);
  return byBand;
}

export function EntityProductions({
  workspaceId,
  entityId,
  variant = 'summary',
}: EntityProductionsProps) {
  const origin = useCurrentHref();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.entities.productions(workspaceId, entityId),
    queryFn: () => getEntityProductions(workspaceId, entityId),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });

  if (isLoading) {
    return (
      <div
        className="border-t border-[var(--stage-edge-subtle)] pt-[var(--stage-padding)] space-y-2"
        data-surface="elevated"
      >
        <div className="h-3 w-24 rounded stage-skeleton" />
        <div className="h-3 w-full rounded stage-skeleton" />
      </div>
    );
  }

  const result = data && 'ok' in data && data.ok ? data : null;
  if (!result || result.productions.length === 0) return null;

  const { productions, bands } = result;
  const byBand = groupByBand(productions);

  return (
    <div
      className={cn(
        'space-y-3',
        variant === 'full'
          ? 'stage-panel rounded-2xl px-5 py-4'
          : 'border-t border-[var(--stage-edge-subtle)] pt-[var(--stage-padding)]',
      )}
      data-surface={variant === 'full' ? 'surface' : 'elevated'}
    >
      <div className="flex items-center justify-between">
        <h3 className="stage-label text-[var(--stage-text-secondary)]">Productions</h3>
        <span className="text-[11px] text-[var(--stage-text-tertiary)] tabular-nums">
          {productions.length}
        </span>
      </div>

      <div className="space-y-3">
        {(['in_play', 'booked'] as const).map((band) =>
          byBand[band].length > 0 ? (
            <BandSection
              key={band}
              band={band}
              productions={byBand[band]}
              count={bands[band]}
              fromPath={origin}
            />
          ) : null,
        )}
        {byBand.past.length > 0 && (
          <CollapsedPastSection
            productions={byBand.past}
            count={bands.past}
            fromPath={origin}
            defaultOpen={variant === 'full'}
          />
        )}
      </div>
    </div>
  );
}

function BandSection({
  band,
  productions,
  count,
  fromPath,
}: {
  band: ProductionBand;
  productions: EntityProduction[];
  count: number;
  fromPath: string;
}) {
  const Icon = BAND_ICON[band];
  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-1.5 text-[var(--stage-text-secondary)]">
        <Icon className="size-3" strokeWidth={1.5} />
        <span className="stage-label">{BAND_LABEL[band]}</span>
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
          {count}
        </span>
      </div>
      <ul className="space-y-1">
        <AnimatePresence initial={false}>
          {productions.map((p) => (
            <ProductionRow key={p.id} production={p} fromPath={fromPath} />
          ))}
        </AnimatePresence>
      </ul>
    </div>
  );
}

function CollapsedPastSection({
  productions,
  count,
  fromPath,
  defaultOpen = false,
}: {
  productions: EntityProduction[];
  count: number;
  fromPath: string;
  defaultOpen?: boolean;
}) {
  const [expanded, setExpanded] = React.useState(defaultOpen);
  const Icon = BAND_ICON.past;

  return (
    <div className="space-y-1.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className={cn(
          'w-full inline-flex items-center gap-1.5 text-left',
          'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
          'transition-colors',
        )}
        aria-expanded={expanded}
      >
        <Icon className="size-3" strokeWidth={1.5} />
        <span className="stage-label">{BAND_LABEL.past}</span>
        <span className="text-[10px] text-[var(--stage-text-tertiary)] tabular-nums">
          {count}
        </span>
        <motion.span
          animate={{ rotate: expanded ? 180 : 0 }}
          transition={STAGE_MEDIUM}
          className="ml-auto text-[var(--stage-text-secondary)]"
        >
          <ChevronDown className="size-3" strokeWidth={1.5} />
        </motion.span>
      </button>
      <AnimatePresence initial={false}>
        {expanded && (
          <motion.ul
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden space-y-1"
          >
            {productions.map((p) => (
              <ProductionRow key={p.id} production={p} fromPath={fromPath} />
            ))}
          </motion.ul>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProductionRow({
  production,
  fromPath,
}: {
  production: EntityProduction;
  fromPath: string;
}) {
  const href = withFrom(production.href, fromPath);
  const dateLabel = production.date ? formatProductionDate(production.date) : null;

  return (
    <motion.li
      layout
      initial={{ opacity: 0, y: 1 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={STAGE_LIGHT}
    >
      <Link
        href={href}
        className={cn(
          'group flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2',
          'hover:bg-[oklch(1_0_0/0.04)] transition-colors',
        )}
      >
        <div className="flex-1 min-w-0 space-y-0.5">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] truncate">
              {production.title ?? 'untitled'}
            </span>
            {production.role && (
              <span className="text-[11px] text-[var(--stage-text-secondary)] shrink-0">
                · {production.role}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[11px] text-[var(--stage-text-secondary)]">
            {dateLabel && <span className="tabular-nums">{dateLabel}</span>}
            {production.status && <span>· {formatStatus(production.status)}</span>}
            {production.amountEstimated != null && (
              <span className="tabular-nums">· ${production.amountEstimated.toLocaleString()}</span>
            )}
          </div>
        </div>
        <ArrowUpRight
          className="size-3 shrink-0 mt-0.5 text-[var(--stage-text-secondary)] opacity-0 group-hover:opacity-100 transition-opacity"
          strokeWidth={1.5}
        />
      </Link>
    </motion.li>
  );
}

function formatProductionDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatStatus(status: string): string {
  return status
    .split('_')
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(' ');
}
