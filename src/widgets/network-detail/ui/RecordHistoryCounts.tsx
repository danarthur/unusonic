'use client';

/**
 * The history, as counts you can click.
 *
 * The panel is meant to be a peek. It had grown to roughly eighteen blocks in
 * one scroll, and three of them were full lists of things that had already
 * happened: every production, the referral ledger in both directions, and the
 * invoice list. A drawer has no room to be a good version of any of those, and
 * the page next door is a better version of all three.
 *
 * So they collapse to one line — "12 shows · 3 referrals · $2,400 outstanding"
 * — and each number is a link into the record page's rail, scrolled to the
 * section it names. Bullhorn's workflow-icon row is the model: the count is
 * the whole signal, because it is what tells you whether the click is worth
 * making. Zero is worth knowing too, so a segment with nothing in it renders
 * nothing rather than a zero, and the row disappears when they are all empty.
 *
 * Deliberately not here: upcoming assignments. Those are what happens next,
 * not what happened, and a count of them is no substitute for the dates.
 *
 * Design: docs/entity-panel-and-page-ia.md §D2.
 */

import * as React from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { cn } from '@/shared/lib/utils';
import { queryKeys } from '@/shared/api/query-keys';
import { getEntityMoney } from '@/features/network-data/api/get-entity-money';
import { getEntityProductions } from '../api/get-entity-productions';
import { getReferralsForEntity } from '../api/get-referrals';

export interface RecordHistoryCountsProps {
  workspaceId: string;
  entityId: string;
  /** Where the segments point: the record page for this node. */
  recordHref: string;
}

/** Anchor ids the record page's rail cards carry, so a segment lands on one. */
export const HISTORY_ANCHOR = {
  productions: 'productions',
  referrals: 'referrals',
  money: 'money',
} as const;

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

function usd(amount: number): string {
  return `$${Math.round(amount).toLocaleString('en-US')}`;
}

export interface HistoryTotals {
  productions: number;
  referrals: number;
  /** What they owe us. */
  outstanding: number;
  /** What we owe them. Never netted against the above -- one number for both
      would hide whichever is smaller, and they answer different questions. */
  owed: number;
}

export interface HistorySegment {
  key: string;
  label: string;
  anchor: string;
}

/** Which segments a set of totals earns. An empty bucket earns none. */
export function historySegments(totals: HistoryTotals): HistorySegment[] {
  const segments: HistorySegment[] = [];
  if (totals.productions > 0) {
    segments.push({
      key: 'productions',
      label: plural(totals.productions, 'show', 'shows'),
      anchor: HISTORY_ANCHOR.productions,
    });
  }
  if (totals.referrals > 0) {
    segments.push({
      key: 'referrals',
      label: plural(totals.referrals, 'referral', 'referrals'),
      anchor: HISTORY_ANCHOR.referrals,
    });
  }
  if (totals.outstanding > 0) {
    segments.push({
      key: 'outstanding',
      label: `${usd(totals.outstanding)} outstanding`,
      anchor: HISTORY_ANCHOR.money,
    });
  }
  if (totals.owed > 0) {
    segments.push({
      key: 'owed',
      label: `${usd(totals.owed)} to pay`,
      anchor: HISTORY_ANCHOR.money,
    });
  }
  return segments;
}

/**
 * The three counts, read from the same queries the record page's cards use --
 * so opening the panel warms the page, and the two surfaces can never disagree
 * about a number.
 */
function useHistoryTotals(workspaceId: string, entityId: string): HistoryTotals {
  const productions = useQuery({
    queryKey: queryKeys.entities.productions(workspaceId, entityId),
    queryFn: () => getEntityProductions(workspaceId, entityId),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });
  const referrals = useQuery({
    queryKey: queryKeys.entities.referrals(workspaceId, entityId),
    queryFn: () => getReferralsForEntity(workspaceId, entityId),
    staleTime: 60_000,
    enabled: Boolean(workspaceId && entityId),
  });
  const money = useQuery({
    queryKey: ['entity-money', entityId],
    queryFn: () => getEntityMoney(entityId),
    staleTime: 60_000,
    enabled: Boolean(entityId),
  });

  const productionResult = productions.data;
  const referralResult = referrals.data;

  return {
    productions:
      productionResult && productionResult.ok ? productionResult.productions.length : 0,
    referrals: referralResult && referralResult.ok
      ? referralResult.referrals.receivedCount + referralResult.referrals.sentCount
      : 0,
    // getEntityMoney returns the shape directly, and an empty one on failure.
    outstanding: money.data?.theyOweUs ?? 0,
    owed: money.data?.weOweThem ?? 0,
  };
}

export function RecordHistoryCounts({
  workspaceId,
  entityId,
  recordHref,
}: RecordHistoryCountsProps) {
  const segments = historySegments(useHistoryTotals(workspaceId, entityId));

  if (segments.length === 0) return null;

  return (
    <div
      className="flex flex-wrap items-center gap-x-1 gap-y-1 border-t border-[var(--stage-edge-subtle)] pt-[var(--stage-padding)]"
      data-surface="elevated"
    >
      {segments.map((segment, i) => (
        <React.Fragment key={segment.key}>
          {i > 0 && (
            <span aria-hidden className="text-[var(--stage-text-tertiary)]">
              ·
            </span>
          )}
          <Link
            href={`${recordHref}#${segment.anchor}`}
            className={cn(
              'rounded-md px-1.5 py-0.5 -mx-0.5 tabular-nums',
              'text-[length:var(--stage-data-size)] text-[var(--stage-text-secondary)]',
              'hover:bg-[oklch(1_0_0/0.06)] hover:text-[var(--stage-text-primary)]',
              'transition-colors duration-[80ms]',
            )}
          >
            {segment.label}
          </Link>
        </React.Fragment>
      ))}
    </div>
  );
}
