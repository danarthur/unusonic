'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckSquare2, Square } from 'lucide-react';
import type { PublicProposalItem } from '../../model/public-proposal';
import { cn } from '@/shared/lib/utils';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface LineItemGridProps {
  items: PublicProposalItem[];
  className?: string;
  style?: React.CSSProperties;
  onSelectionChange?: (itemId: string, selected: boolean) => void;
  disabled?: boolean;
}

function formatCurrency(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

function effectiveUnitPrice(item: PublicProposalItem): number {
  const override = (item as { override_price?: number | null }).override_price;
  return override != null && isFinite(Number(override))
    ? Number(override)
    : parseFloat(String(item.unit_price ?? 0));
}

function lineTotal(item: PublicProposalItem): number {
  const unitMultiplier = (item as { unit_multiplier?: number | null }).unit_multiplier;
  const multiplier = unitMultiplier != null && Number(unitMultiplier) > 0 ? Number(unitMultiplier) : 1;
  return (item.quantity ?? 1) * multiplier * effectiveUnitPrice(item);
}

function formatTime24to12(time24: string): string {
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 || 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

function getTimeRangeLabel(item: PublicProposalItem): string | null {
  const showTimes = (item as { show_times_on_proposal?: boolean | null }).show_times_on_proposal;
  if (showTimes === false) return null;
  const start = (item as { time_start?: string | null }).time_start;
  const end = (item as { time_end?: string | null }).time_end;
  if (!start && !end) return null;
  if (start && end) return `${formatTime24to12(start)} – ${formatTime24to12(end)}`;
  if (start) return `From ${formatTime24to12(start)}`;
  return `Until ${formatTime24to12(end!)}`;
}

function slugify(s: string): string {
  return s.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');
}

function groupItems(items: PublicProposalItem[]): { groupName: string; groupItems: PublicProposalItem[] }[] {
  const groups = new Map<string, PublicProposalItem[]>();
  for (const item of items) {
    const groupName = (item as { display_group_name?: string | null }).display_group_name ?? 'Included';
    if (!groups.has(groupName)) groups.set(groupName, []);
    groups.get(groupName)!.push(item);
  }
  return Array.from(groups.entries()).map(([groupName, groupItems]) => ({ groupName, groupItems }));
}

export function LineItemGrid({ items, className, style, onSelectionChange, disabled }: LineItemGridProps) {
  if (!items.length) return null;

  const isSingle = items.length === 1;
  const hasGroups = items.some((i) => (i as { display_group_name?: string | null }).display_group_name);
  const grouped = groupItems(items);

  const renderCard = (item: PublicProposalItem, i: number) => {
    const imageUrl = item.packageImageUrl ?? null;
    const isDeselected = item.isOptional && !item.clientSelected;

    return (
      <motion.article
        key={item.id}
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: i * 0.04 }}
        className={cn(
          'group rounded-[var(--portal-radius)] overflow-hidden relative',
          'portal-levitation',
          'transition-all duration-300',
          imageUrl && isSingle && 'max-h-[320px] sm:max-h-[360px] flex flex-col',
          isDeselected && 'opacity-60'
        )}
        style={{
          backgroundColor: 'var(--portal-surface)',
          border: isDeselected
            ? 'var(--portal-border-width) dashed var(--portal-border)'
            : 'var(--portal-border-width) solid var(--portal-border)',
        }}
      >
        {/* Optional checkbox + pill */}
        {item.isOptional && (
          <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
            <span className="text-[10px] uppercase tracking-widest" style={{ color: 'var(--portal-accent)' }}>
              Optional
            </span>
            <button
              type="button"
              disabled={disabled}
              onClick={() => onSelectionChange?.(item.id, !item.clientSelected)}
              className="hover:opacity-80 transition-opacity focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--portal-accent)] rounded disabled:pointer-events-none"
              style={{ color: 'var(--portal-accent)' }}
              aria-label={item.clientSelected ? `Remove ${item.name}` : `Add ${item.name}`}
            >
              {item.clientSelected
                ? <CheckSquare2 className="w-5 h-5" />
                : <Square className="w-5 h-5" />
              }
            </button>
          </div>
        )}

        {imageUrl && (
          <div
            className={cn(
              'relative overflow-hidden shrink-0',
              isSingle ? 'aspect-[4/3] max-h-[180px] sm:max-h-[200px]' : 'aspect-[4/3] sm:aspect-square'
            )}
            style={{ backgroundColor: 'var(--portal-surface-subtle)' }}
          >
            <img
              src={imageUrl}
              alt=""
              className="absolute inset-0 w-full h-full object-cover transition-[filter] duration-500 group-hover:brightness-[1.02]"
            />
          </div>
        )}
        <div className="flex flex-col gap-2" style={{ padding: 'var(--portal-card-padding)' }}>
          <h3
            className="font-medium tracking-tight text-base leading-snug"
            style={{ color: 'var(--portal-text)' }}
          >
            {item.name}
          </h3>
          {item.description ? (
            <p className="text-sm line-clamp-2 leading-relaxed" style={{ color: 'var(--portal-text-secondary)' }}>
              {item.description}
            </p>
          ) : null}
          {getTimeRangeLabel(item) && (
            <p className="text-[13px] tabular-nums leading-snug" style={{ color: 'var(--portal-text-secondary)' }}>
              {getTimeRangeLabel(item)}
            </p>
          )}
          {item.talentNames && item.talentNames.length > 0 && (
            <p className="text-[13px] leading-snug" style={{ color: 'var(--portal-accent)' }}>
              Featuring {item.talentNames.join(' & ')}
            </p>
          )}
          <div className="mt-auto pt-2 flex items-baseline justify-between gap-2">
            <p className="text-xs" style={{ color: 'var(--portal-text-secondary)' }}>
              {item.quantity} × {formatCurrency(effectiveUnitPrice(item))}
            </p>
            <p className="text-base font-semibold tabular-nums" style={{ color: 'var(--portal-text)' }}>
              {isDeselected ? (
                <span className="line-through" style={{ color: 'var(--portal-text-secondary)' }}>
                  {formatCurrency(lineTotal(item))}
                </span>
              ) : (
                formatCurrency(lineTotal(item))
              )}
            </p>
          </div>
        </div>
      </motion.article>
    );
  };

  if (!hasGroups) {
    return (
      <div
        className={cn(
          'grid',
          isSingle ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
          className
        )}
        style={style}
      >
        {items.map((item, i) => renderCard(item, i))}
      </div>
    );
  }

  return (
    <div className={className}>
      {grouped.map(({ groupName, groupItems: groupedItems }) => (
        <section id={`section-${slugify(groupName)}`} key={groupName}>
          <h3
            className="mb-4 mt-8 pb-2 first:mt-0"
            style={{
              color: 'var(--portal-text-secondary)',
              fontSize: 'var(--portal-label-size)',
              fontWeight: 'var(--portal-label-weight)',
              letterSpacing: 'var(--portal-label-tracking)',
              textTransform: 'var(--portal-label-transform)' as React.CSSProperties['textTransform'],
              borderBottom: 'var(--portal-divider)',
            }}
          >
            {groupName}
          </h3>
          <div
            className={cn(
              'grid',
              isSingle ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
            )}
            style={{ gap: 'var(--portal-gap)' }}
          >
            {groupedItems.map((item, i) => renderCard(item, i))}
          </div>
        </section>
      ))}
    </div>
  );
}
