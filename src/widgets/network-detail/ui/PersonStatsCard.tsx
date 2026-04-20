'use client';

/**
 * PersonStatsCard — role-conditional stats card for a person entity.
 *
 * Structure (per docs/reference/person-stats-card-design.md §2):
 *   • One-line Aion verdict at top
 *   • 3–4 role-conditional tiles
 *   • Variant-specific sparkline (12mo shows for crew, 24mo bookings for client)
 *   • Optional badge row (AR overdue, cert expiring, etc.)
 *
 * Phase 1 shipped crew. Phase 2 adds client. Vendor + employee are Phase 3.
 * Unsupported variants cause the card to return null — the rest of the page
 * (promoted row, summary, productions, captures) already covers them.
 */

import * as React from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { queryKeys } from '@/shared/api/query-keys';
import {
  getPersonRelationshipStats,
  type PersonRelationshipStats,
  type SparklinePoint,
} from '../api/get-person-relationship-stats';

export interface PersonStatsCardProps {
  workspaceId: string;
  entityId: string;
}

export function PersonStatsCard({ workspaceId, entityId }: PersonStatsCardProps) {
  const { data, isLoading } = useQuery({
    queryKey: queryKeys.entities.relationshipStats(workspaceId, entityId),
    queryFn: () => getPersonRelationshipStats(workspaceId, entityId),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });

  if (isLoading) {
    return (
      <div
        className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-3"
        data-surface="elevated"
      >
        <div className="h-3 w-40 rounded stage-skeleton" />
        <div className="flex gap-4">
          <div className="h-8 w-16 rounded stage-skeleton" />
          <div className="h-8 w-16 rounded stage-skeleton" />
          <div className="h-8 w-16 rounded stage-skeleton" />
        </div>
        <div className="h-6 w-full rounded stage-skeleton" />
      </div>
    );
  }

  const stats = data && 'ok' in data && data.ok ? data.stats : null;
  if (!stats) return null;

  // All four supported variants render. Unknown (no relationship) still hides.
  if (stats.variantKind === 'unknown') return null;

  const sparklineByVariant: Record<Exclude<typeof stats.variantKind, 'unknown'>, SparklinePoint[]> = {
    crew: stats.crew.sparkline,
    client: stats.client.sparkline,
    vendor: stats.vendor.sparkline,
    employee: stats.employee.sparkline,
  };
  const sparkline = sparklineByVariant[stats.variantKind];

  const sparklineLabelByVariant: Record<Exclude<typeof stats.variantKind, 'unknown'>, string> = {
    crew: 'Shows per month, last 12 months',
    client: 'Bookings per month, last 24 months',
    vendor: 'Shared shows per month, last 24 months',
    employee: 'Days worked per week, last 12 weeks',
  };
  const sparklineLabel = sparklineLabelByVariant[stats.variantKind];

  return (
    <motion.div
      initial={{ opacity: 0, y: 1 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_LIGHT}
      className="rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4 space-y-3"
      data-surface="elevated"
    >
      <div className="flex items-center justify-between">
        <h3 className="stage-label text-[var(--stage-text-secondary)]">Stats</h3>
        <VariantBadge variantKind={stats.variantKind} />
      </div>

      <VerdictLine stats={stats} />

      {stats.variantKind === 'crew' && <CrewTiles stats={stats} />}
      {stats.variantKind === 'client' && <ClientTiles stats={stats} />}
      {stats.variantKind === 'vendor' && <VendorTiles stats={stats} />}
      {stats.variantKind === 'employee' && <EmployeeTiles stats={stats} />}

      {sparkline.some((p) => p.count > 0) && (
        <Sparkline points={sparkline} label={sparklineLabel} />
      )}

      {stats.variantKind === 'client' && stats.client.arOverdueAmount > 0 && (
        <ArOverdueBadge amount={stats.client.arOverdueAmount} />
      )}
    </motion.div>
  );
}

// ── Variant chip ────────────────────────────────────────────────────────────

function VariantBadge({ variantKind }: { variantKind: PersonRelationshipStats['variantKind'] }) {
  if (variantKind === 'unknown') return null;
  const label = variantKind.charAt(0).toUpperCase() + variantKind.slice(1);
  return (
    <span className="stage-label text-[var(--stage-text-tertiary)]">{label}</span>
  );
}

// ── Verdict ─────────────────────────────────────────────────────────────────

function VerdictLine({ stats }: { stats: PersonRelationshipStats }) {
  // Aion insight wins when present (precomputed, not a fresh LLM call here).
  if (stats.aionInsightText) {
    return (
      <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)] leading-snug">
        {stats.aionInsightText}
      </p>
    );
  }

  const fallback = composeFallbackVerdict(stats);
  if (!fallback) return null;

  return (
    <p className="text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)] leading-snug">
      {fallback}
    </p>
  );
}

function composeFallbackVerdict(stats: PersonRelationshipStats): string | null {
  if (stats.variantKind === 'crew') {
    const parts: string[] = [];
    const { acceptsLast12Mo, offersLast12Mo, showsLast12MoCount, lastWorkedAt, activeShowsCount } = stats.crew;
    if (offersLast12Mo >= 3) {
      parts.push(`Accepted ${acceptsLast12Mo} of last ${offersLast12Mo} calls`);
    } else if (showsLast12MoCount > 0) {
      parts.push(`${showsLast12MoCount} show${showsLast12MoCount === 1 ? '' : 's'} in the last 12 months`);
    } else if (stats.showsCountAllTime > 0) {
      parts.push(`${stats.showsCountAllTime} show${stats.showsCountAllTime === 1 ? '' : 's'} all-time`);
    }
    if (lastWorkedAt) {
      parts.push(`last worked ${formatRelative(lastWorkedAt)}`);
    } else if (activeShowsCount > 0) {
      parts.push(`${activeShowsCount} upcoming`);
    }
    if (parts.length === 0) return null;
    return parts.join(' · ') + '.';
  }
  if (stats.variantKind === 'client') {
    const parts: string[] = [];
    const { lifetimePaid, outstandingBalance, lastBookedAt, activeShowsCount } = stats.client;
    if (lifetimePaid > 0) {
      parts.push(`$${formatMoney(lifetimePaid)} lifetime`);
    }
    if (activeShowsCount > 0) {
      parts.push(`${activeShowsCount} active`);
    } else if (lastBookedAt) {
      parts.push(`last booked ${formatRelative(lastBookedAt)}`);
    }
    if (outstandingBalance > 0) {
      parts.push(`$${formatMoney(outstandingBalance)} outstanding`);
    }
    if (parts.length === 0) return null;
    return parts.join(' · ') + '.';
  }
  if (stats.variantKind === 'employee') {
    const { utilizationPct, upcoming14dCount, upcomingAllCount } = stats.employee;
    const parts: string[] = [];
    parts.push(`${utilizationPct}% utilized last 30d`);
    if (upcoming14dCount > 0) {
      parts.push(`${upcoming14dCount} in the next 14d`);
    } else if (upcomingAllCount > 0) {
      parts.push(`${upcomingAllCount} upcoming`);
    } else {
      parts.push('nothing on the schedule');
    }
    return parts.join(' · ') + '.';
  }
  if (stats.variantKind === 'vendor') {
    const { employerCompanyName, sharedShowsCount, lastCollabAt, activeSharedCount } = stats.vendor;
    const lead = employerCompanyName ? `Via ${employerCompanyName}` : 'Vendor partner';
    if (sharedShowsCount === 0) {
      // Honors design doc §11: "introduced, no collab yet" empty state.
      return `${lead} · no shared shows yet.`;
    }
    const parts: string[] = [`${sharedShowsCount} show${sharedShowsCount === 1 ? '' : 's'} together`];
    if (activeSharedCount > 0) {
      parts.push(`${activeSharedCount} active`);
    } else if (lastCollabAt) {
      parts.push(`last collab ${formatRelative(lastCollabAt)}`);
    }
    return `${lead} · ${parts.join(' · ')}.`;
  }
  return null;
}

// ── Tiles ───────────────────────────────────────────────────────────────────

function CrewTiles({ stats }: { stats: PersonRelationshipStats }) {
  const {
    defaultHourlyRate,
    acceptsLast12Mo,
    offersLast12Mo,
    lastWorkedAt,
    showsLast12MoCount,
  } = stats.crew;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Tile
        label="Last worked"
        value={lastWorkedAt ? formatRelative(lastWorkedAt) : '—'}
        muted={!lastWorkedAt}
      />
      <Tile
        label="Shows 12mo"
        value={showsLast12MoCount.toString()}
        muted={showsLast12MoCount === 0}
      />
      <Tile
        label="Default rate"
        value={defaultHourlyRate ? `$${defaultHourlyRate.toLocaleString()}/hr` : '—'}
        muted={!defaultHourlyRate}
      />
      <Tile
        label="Accepts"
        value={offersLast12Mo > 0 ? `${acceptsLast12Mo}/${offersLast12Mo}` : '—'}
        muted={offersLast12Mo === 0}
      />
    </div>
  );
}

function ClientTiles({ stats }: { stats: PersonRelationshipStats }) {
  const { lifetimePaid, outstandingBalance, activeShowsCount, lastBookedAt } = stats.client;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Tile
        label="Lifetime paid"
        value={lifetimePaid > 0 ? `$${formatMoney(lifetimePaid)}` : '—'}
        muted={lifetimePaid === 0}
      />
      <Tile
        label="Outstanding"
        value={outstandingBalance > 0 ? `$${formatMoney(outstandingBalance)}` : '—'}
        muted={outstandingBalance === 0}
      />
      <Tile
        label="Active"
        value={activeShowsCount.toString()}
        muted={activeShowsCount === 0}
      />
      <Tile
        label="Last booked"
        value={lastBookedAt ? formatRelative(lastBookedAt) : '—'}
        muted={!lastBookedAt}
      />
    </div>
  );
}

function EmployeeTiles({ stats }: { stats: PersonRelationshipStats }) {
  const { utilizationPct, worked30dCount, upcoming14dCount, upcomingAllCount } = stats.employee;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Tile
        label="Util 30d"
        value={`${utilizationPct}%`}
        muted={utilizationPct === 0}
      />
      <Tile
        label="Worked 30d"
        value={worked30dCount.toString()}
        muted={worked30dCount === 0}
      />
      <Tile
        label="Next 14d"
        value={upcoming14dCount.toString()}
        muted={upcoming14dCount === 0}
      />
      <Tile
        label="Upcoming"
        value={upcomingAllCount.toString()}
        muted={upcomingAllCount === 0}
      />
    </div>
  );
}

function VendorTiles({ stats }: { stats: PersonRelationshipStats }) {
  const { sharedShowsCount, lastCollabAt, firstCollabAt, activeSharedCount } = stats.vendor;
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      <Tile
        label="Shows together"
        value={sharedShowsCount.toString()}
        muted={sharedShowsCount === 0}
      />
      <Tile
        label="Last collab"
        value={lastCollabAt ? formatRelative(lastCollabAt) : '—'}
        muted={!lastCollabAt}
      />
      <Tile
        label="Active shared"
        value={activeSharedCount.toString()}
        muted={activeSharedCount === 0}
      />
      <Tile
        label="Working since"
        value={firstCollabAt ? formatRelative(firstCollabAt) : '—'}
        muted={!firstCollabAt}
      />
    </div>
  );
}

function Tile({
  label,
  value,
  muted,
}: {
  label: string;
  value: string;
  muted: boolean;
}) {
  return (
    <div className="flex flex-col gap-0.5 min-w-0">
      <span className="text-[10px] uppercase tracking-wider text-[var(--stage-text-tertiary)] truncate">
        {label}
      </span>
      <span
        className={cn(
          'text-[length:var(--stage-data-size)] font-medium tabular-nums truncate',
          muted ? 'text-[var(--stage-text-tertiary)]' : 'text-[var(--stage-text-primary)]',
        )}
      >
        {value}
      </span>
    </div>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────────

function Sparkline({ points, label }: { points: SparklinePoint[]; label: string }) {
  const max = Math.max(1, ...points.map((p) => p.count));
  return (
    <div className="flex items-end gap-1 h-6" aria-label={label}>
      {points.map((p, i) => {
        const pct = p.count / max;
        const label = new Date(p.month).toLocaleDateString('en-US', {
          month: 'short',
          year: '2-digit',
        });
        return (
          <div
            key={p.month}
            className="flex-1 flex items-end"
            title={`${label}: ${p.count} show${p.count === 1 ? '' : 's'}`}
          >
            <div
              className={cn(
                'w-full rounded-sm transition-colors',
                p.count === 0
                  ? 'bg-[var(--stage-edge-subtle)]'
                  : 'bg-[var(--stage-text-secondary)]',
              )}
              style={{
                height: p.count === 0
                  ? '2px'
                  : `${Math.max(10, pct * 100)}%`,
              }}
              aria-hidden
            />
            {/* visually-hidden bin index for a11y row readers; the title attr
                on the parent already surfaces the tooltip for sighted users */}
            <span className="sr-only">{label}: {p.count}</span>
            {i === points.length - 1 && null}
          </div>
        );
      })}
    </div>
  );
}

// ── Badge row ───────────────────────────────────────────────────────────────

function ArOverdueBadge({ amount }: { amount: number }) {
  return (
    <div
      className={cn(
        'inline-flex items-center gap-1.5 rounded-md px-2 py-1 -mx-1',
        'text-[11px] text-[var(--color-unusonic-warning)]',
        'bg-[color-mix(in_oklch,var(--color-unusonic-warning)_10%,transparent)]',
        'border border-[color-mix(in_oklch,var(--color-unusonic-warning)_25%,transparent)]',
      )}
    >
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      <span>AR overdue 30d+: ${formatMoney(amount)}</span>
    </div>
  );
}

// ── Formatting ──────────────────────────────────────────────────────────────

function formatMoney(amount: number): string {
  // Short form for tiles: 1,234 / 12.4K / 1.2M
  if (amount < 1000) return amount.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (amount < 1_000_000) return (amount / 1000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'K';
  return (amount / 1_000_000).toLocaleString(undefined, { maximumFractionDigits: 1 }) + 'M';
}

function formatRelative(iso: string): string {
  const d = new Date(iso);
  const ms = Date.now() - d.getTime();
  const past = ms >= 0;
  const absMs = Math.abs(ms);
  const minutes = Math.floor(absMs / 60_000);
  if (minutes < 60) return past ? `${Math.max(1, minutes)}m ago` : 'soon';
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return past ? `${hours}h ago` : `in ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return past ? `${days}d ago` : `in ${days}d`;
  const months = Math.floor(days / 30);
  if (months < 12) return past ? `${months}mo ago` : `in ${months}mo`;
  const years = Math.floor(days / 365);
  return past ? `${years}y ago` : `in ${years}y`;
}
