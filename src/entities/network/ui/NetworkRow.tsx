'use client';

/**
 * A contact as a row.
 *
 * The card was the wrong control for most of this directory. Of eleven products
 * checked -- Google Contacts, Apple Contacts, Attio, HubSpot, Pipedrive,
 * Airtable, Notion, Monday, Linear, Folk, Salesforce -- not one ships a card
 * grid as the default for a flat list of people, and most ship none at all.
 * Where cards appear they are earned by grouping and drag, never by browsing.
 *
 * The reason shows up here as soon as a record is thin. A card is a container
 * that promises content, so one holding a single fact reads as unfinished at
 * any size -- shrinking it just makes a smaller unfinished thing. A row
 * promises nothing, so a row holding only a name is a finished row. That is the
 * whole argument, and it is why venues and clients want this and the crew does
 * not.
 *
 * Layout follows Material's list tiers: a fixed height per tier, a capped line
 * count, and content allowed to run ragged between items. The constraint is on
 * POSITION -- the rate is always in the same place -- never on whether a given
 * item has one.
 *
 * @module entities/network/ui/NetworkRow
 */

import * as React from 'react';
import { cn } from '@/shared/lib/utils';
import { EntityAvatar } from './EntityAvatar';
import { isFlagged } from '../model/card-slots';
import type { RowFact } from '../model/row-facts';
import { formatUsd, formatDay, formatUpcoming, parseShowDate } from '../model/format-facts';
import type { NetworkNode } from '../model/types';

export interface NetworkRowProps {
  node: NetworkNode;
  /**
   * Columns for the whole list this row belongs to, from rowFactsFor().
   * Decided per list rather than per row so the columns do not shift as the
   * eye moves down it.
   */
  facts: RowFact[];
  onClick?: () => void;
  onAffiliateClick?: (entityId: string) => void;
}

/**
 * One right-hand fact.
 *
 * Absent renders as reserved space rather than a dash. The dash convention
 * belongs to tables, where a cell exists whether or not it holds a value; here
 * there is no cell, and Primer's objection applies -- a dash is noise to a
 * screen reader for a value that simply is not set yet.
 */
function Fact({
  label,
  value,
  tone,
  className,
}: {
  label: string;
  value: string | null;
  tone?: 'warning';
  className?: string;
}) {
  return (
    <div className={cn('hidden min-w-0 shrink-0 flex-col items-end', className)}>
      <span className="stage-badge-text text-[var(--stage-text-tertiary)]">{label}</span>
      <span
        className={cn(
          'truncate font-[family-name:var(--stage-data-font)] text-[length:var(--stage-readout-sm-size)] tabular-nums',
          tone === 'warning'
            ? 'text-[var(--color-unusonic-warning)]'
            : 'text-[var(--stage-text-primary)]',
          !value && 'opacity-0',
        )}
        aria-hidden={!value}
      >
        {value ?? '—'}
      </span>
    </div>
  );
}

/** What they are, and where — the one line under the name. */
function subtitleOf(node: NetworkNode): string | null {
  const parts = [node.identity.label, node.employer?.name ?? node.meta.region].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

function lastShowLabel(node: NetworkNode, now: Date): string | null {
  const show = parseShowDate(node.meta.lastWorked);
  return show ? formatDay(show, now) : null;
}

function nextShowLabel(node: NetworkNode, now: Date): string | null {
  const show = parseShowDate(node.meta.nextBooked);
  if (!show) return null;
  const when = formatUpcoming(show, now);
  return node.meta.nextConfirmed ? when : `${when}?`;
}

/** Money, in whichever direction it runs. Never netted into one figure. */
function moneyOf(node: NetworkNode): { value: string; label: string } | null {
  const owed = node.meta.outstanding_balance ?? 0;
  if (owed > 0) return { value: formatUsd(owed), label: 'Owes' };

  const payable = node.meta.payable_balance ?? 0;
  if (payable > 0) return { value: formatUsd(payable), label: 'You owe' };

  return null;
}

/**
 * The right-hand facts, in a fixed order.
 *
 * They drop from the right as the row narrows -- the ones nearest the name
 * survive longest, because those are the ones asked about most.
 */
function RowFacts({ node, facts, now }: { node: NetworkNode; facts: RowFact[]; now: Date }) {
  const money = moneyOf(node);
  const rate = node.meta.rate;

  return (
    <>
      {facts.includes('rate') && (
        <Fact
          label="Rate"
          value={rate ? `${formatUsd(rate.amount)}${rate.unit ? ` / ${rate.unit}` : ''}` : null}
          className="w-24 xl:flex"
        />
      )}
      {facts.includes('lastShow') && (
        <Fact label="Last show" value={lastShowLabel(node, now)} className="w-20 lg:flex" />
      )}
      {facts.includes('next') && (
        <Fact label="Next" value={nextShowLabel(node, now)} className="w-20 sm:flex" />
      )}
      {facts.includes('money') && (
        <Fact
          label={money?.label ?? 'Owes'}
          value={money?.value ?? null}
          tone="warning"
          className="w-20 sm:flex"
        />
      )}
    </>
  );
}

/**
 * People at this company. Often the only place they surface on the contacts
 * page at all, so they stay reachable rather than becoming plain text.
 */
function Affiliates({
  node,
  onAffiliateClick,
}: {
  node: NetworkNode;
  onAffiliateClick?: (entityId: string) => void;
}) {
  const people = node.affiliates ?? [];
  if (people.length === 0 || !onAffiliateClick) return null;

  return (
    <p className="hidden min-w-0 max-w-[12rem] truncate stage-label text-[var(--stage-text-secondary)] 2xl:block">
      {people.slice(0, 2).map((a, i) => (
        <React.Fragment key={a.entityId}>
          {i > 0 && ', '}
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onAffiliateClick(a.entityId);
            }}
            className="rounded-sm underline decoration-[var(--stage-text-tertiary)] underline-offset-2 hover:text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            {a.name}
          </button>
        </React.Fragment>
      ))}
      {people.length > 2 && ` +${people.length - 2}`}
    </p>
  );
}

export function NetworkRow({ node, facts, onClick, onAffiliateClick }: NetworkRowProps) {
  const now = React.useMemo(() => new Date(), []);
  const subtitle = subtitleOf(node);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group flex w-full cursor-pointer items-center gap-4 rounded-[var(--stage-radius-nested)]',
        'px-3 py-2.5 sm:px-4',
        'text-left transition-colors duration-[80ms] hover:bg-[oklch(1_0_0_/_0.04)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        node.meta.archived && 'opacity-40',
      )}
    >
      <EntityAvatar
        name={node.identity.name}
        avatarUrl={node.identity.avatarUrl}
        entityType={node.identity.entityType}
        sizeClassName="size-8"
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
          {node.identity.name}
          {isFlagged(node) && (
            <span className="ml-2 stage-badge-text text-[var(--color-unusonic-warning)]">
              Do not rebook
            </span>
          )}
        </p>
        {subtitle && (
          <p className="truncate stage-label text-[var(--stage-text-secondary)]">{subtitle}</p>
        )}
      </div>

      <RowFacts node={node} facts={facts} now={now} />

      <Affiliates node={node} onAffiliateClick={onAffiliateClick} />
    </div>
  );
}
