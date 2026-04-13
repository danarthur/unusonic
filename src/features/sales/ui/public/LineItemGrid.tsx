'use client';

import React from 'react';
import { motion } from 'framer-motion';
import { CheckSquare2, Square } from 'lucide-react';
import type { PublicProposalItem } from '../../model/public-proposal';
import { SectionTrim, type TrimVariant } from './SectionTrim';
import { cn } from '@/shared/lib/utils';

import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
const spring = STAGE_MEDIUM;

export interface LineItemGridProps {
  items: PublicProposalItem[];
  className?: string;
  style?: React.CSSProperties;
  onSelectionChange?: (itemId: string, selected: boolean) => void;
  disabled?: boolean;
  /** Event-level start/end times — line items matching these exactly won't show times (avoid redundancy). */
  eventStartTime?: string | null;
  eventEndTime?: string | null;
  /** Layout variant driven by portal theme. */
  layout?: 'card' | 'row' | 'minimal';
  /** Alternate bg/surface background per section group. */
  sectionBgAlternate?: boolean;
  /** SVG trim divider between grouped sections. */
  sectionTrim?: TrimVariant;
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
  const unitType = (item as { unit_type?: string | null }).unit_type;
  const unitMultiplier = (item as { unit_multiplier?: number | null }).unit_multiplier;
  const multiplier = (unitType === 'hour' || unitType === 'day') && unitMultiplier != null && Number(unitMultiplier) > 0 ? Number(unitMultiplier) : 1;
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

// =============================================================================
// Optional item controls (shared across layouts)
// =============================================================================

function OptionalControls({
  item,
  disabled,
  onSelectionChange,
  position = 'inline',
}: {
  item: PublicProposalItem;
  disabled?: boolean;
  onSelectionChange?: (itemId: string, selected: boolean) => void;
  position?: 'absolute' | 'inline';
}) {
  if (!item.isOptional) return null;
  return (
    <div className={cn(
      'flex items-center gap-2',
      position === 'absolute' && 'absolute top-3 right-3 z-10'
    )}>
      <span className="stage-label" style={{ color: 'var(--portal-accent)' }}>
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
  );
}

// =============================================================================
// Layout: Card (default — rich cards with images)
// =============================================================================

function CardItem({
  item,
  i,
  isSingle,
  disabled,
  onSelectionChange,
  eventStartTime,
  eventEndTime,
}: {
  item: PublicProposalItem;
  i: number;
  isSingle: boolean;
  disabled?: boolean;
  onSelectionChange?: (itemId: string, selected: boolean) => void;
  eventStartTime?: string | null;
  eventEndTime?: string | null;
}) {
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
        'transition-colors duration-100',
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
      <OptionalControls item={item} disabled={disabled} onSelectionChange={onSelectionChange} position="absolute" />

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
            className="absolute inset-0 w-full h-full object-cover duration-500"
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
        {(() => {
          const timeLabel = getTimeRangeLabel(item);
          if (!timeLabel) return null;
          const itemStart = (item as { time_start?: string | null }).time_start;
          const itemEnd = (item as { time_end?: string | null }).time_end;
          if (eventStartTime && eventEndTime && itemStart === eventStartTime && itemEnd === eventEndTime) return null;
          return (
            <p className="text-[13px] tabular-nums leading-snug" style={{ color: 'var(--portal-text-secondary)' }}>
              {timeLabel}
            </p>
          );
        })()}
        {(() => {
          const ut = (item as { unit_type?: string | null }).unit_type;
          const um = (item as { unit_multiplier?: number | null }).unit_multiplier;
          if ((!ut || ut === 'flat') && um != null && Number(um) > 1) {
            const hrs = Number(um);
            return (
              <p className="text-[13px] tabular-nums leading-snug" style={{ color: 'var(--portal-text-secondary)' }}>
                {hrs % 1 === 0 ? hrs : hrs.toFixed(1)} hour{hrs !== 1 ? 's' : ''}
              </p>
            );
          }
          return null;
        })()}
        {(() => {
          const snap = (item as { definition_snapshot?: Record<string, unknown> }).definition_snapshot;
          const sMeta = snap?.schedule_meta as { performance_set_count?: number; performance_duration_minutes?: number } | undefined;
          const setCount = sMeta?.performance_set_count;
          const setDuration = sMeta?.performance_duration_minutes;
          if (setCount && setDuration) {
            return (
              <p className="text-[13px] tabular-nums leading-snug" style={{ color: 'var(--portal-text-secondary)' }}>
                {setCount} × {setDuration} min set{setCount > 1 ? 's' : ''}
              </p>
            );
          }
          return null;
        })()}
        {item.talentNames && item.talentNames.length > 0 && (
          <div className="flex items-center gap-2">
            {item.talentAvatarUrl && (
              <img
                src={item.talentAvatarUrl}
                alt=""
                className="w-8 h-8 rounded-full object-cover shrink-0"
                style={{ border: 'var(--portal-border-width) solid var(--portal-border)' }}
              />
            )}
            <p className="text-[13px] leading-snug" style={{ color: 'var(--portal-accent)' }}>
              Featuring {item.talentNames.join(' & ')}
            </p>
          </div>
        )}
        <div className="mt-auto pt-2 flex items-baseline justify-between gap-2">
          <p className="text-xs" style={{ color: 'var(--portal-text-secondary)' }}>
            {item.quantity} × {formatCurrency(effectiveUnitPrice(item))}
          </p>
          <p className="text-base font-medium tabular-nums" style={{ color: 'var(--portal-text)' }}>
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
}

// =============================================================================
// Layout: Row (dense table — corporate AV, technical production)
// =============================================================================

function RowItem({
  item,
  i,
  disabled,
  onSelectionChange,
}: {
  item: PublicProposalItem;
  i: number;
  disabled?: boolean;
  onSelectionChange?: (itemId: string, selected: boolean) => void;
}) {
  const isDeselected = item.isOptional && !item.clientSelected;
  const total = lineTotal(item);

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...spring, delay: i * 0.02 }}
      className={cn(
        'grid grid-cols-[1fr_auto_auto_auto] items-baseline gap-x-4 py-3',
        isDeselected && 'opacity-60',
      )}
      style={{
        borderBottom: 'var(--portal-border-width) solid var(--portal-border-subtle)',
      }}
    >
      {/* Item name + description */}
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium truncate" style={{ color: 'var(--portal-text)' }}>
            {item.name}
          </p>
          {item.isOptional && (
            <OptionalControls item={item} disabled={disabled} onSelectionChange={onSelectionChange} position="inline" />
          )}
        </div>
        {item.description && (
          <p className="text-xs truncate mt-0.5" style={{ color: 'var(--portal-text-secondary)' }}>
            {item.description}
          </p>
        )}
      </div>
      {/* Qty */}
      <p className="text-xs tabular-nums text-right whitespace-nowrap" style={{ color: 'var(--portal-text-secondary)' }}>
        ×{item.quantity ?? 1}
      </p>
      {/* Rate */}
      <p className="text-xs tabular-nums text-right whitespace-nowrap" style={{ color: 'var(--portal-text-secondary)' }}>
        {formatCurrency(effectiveUnitPrice(item))}
      </p>
      {/* Total */}
      <p className="text-sm font-medium tabular-nums text-right whitespace-nowrap" style={{ color: 'var(--portal-text)' }}>
        {isDeselected ? (
          <span className="line-through" style={{ color: 'var(--portal-text-secondary)' }}>
            {formatCurrency(total)}
          </span>
        ) : (
          formatCurrency(total)
        )}
      </p>
    </motion.div>
  );
}

// =============================================================================
// Layout: Minimal (name + price — luxury, editorial, gallery)
// =============================================================================

function MinimalItem({
  item,
  i,
  disabled,
  onSelectionChange,
}: {
  item: PublicProposalItem;
  i: number;
  disabled?: boolean;
  onSelectionChange?: (itemId: string, selected: boolean) => void;
}) {
  const isDeselected = item.isOptional && !item.clientSelected;
  const total = lineTotal(item);

  return (
    <motion.div
      key={item.id}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ ...spring, delay: i * 0.03 }}
      className={cn(
        'flex items-baseline justify-between py-3',
        isDeselected && 'opacity-60',
      )}
      style={{
        borderBottom: '1px solid var(--portal-border-subtle)',
      }}
    >
      <div className="flex items-center gap-3 min-w-0">
        <p className="text-sm truncate" style={{ color: 'var(--portal-text)' }}>
          {item.name}
        </p>
        {item.isOptional && (
          <OptionalControls item={item} disabled={disabled} onSelectionChange={onSelectionChange} position="inline" />
        )}
      </div>
      <p className="text-sm tabular-nums ml-4 shrink-0" style={{ color: 'var(--portal-text)' }}>
        {isDeselected ? (
          <span className="line-through" style={{ color: 'var(--portal-text-secondary)' }}>
            {formatCurrency(total)}
          </span>
        ) : (
          formatCurrency(total)
        )}
      </p>
    </motion.div>
  );
}

// =============================================================================
// Row layout table header
// =============================================================================

function RowHeader() {
  return (
    <div
      className="grid grid-cols-[1fr_auto_auto_auto] gap-x-4 pb-2 mb-1"
      style={{ borderBottom: '1px solid var(--portal-border)' }}
    >
      <p className="text-xs font-medium uppercase tracking-wider" style={{ color: 'var(--portal-text-secondary)' }}>Item</p>
      <p className="text-xs font-medium uppercase tracking-wider text-right" style={{ color: 'var(--portal-text-secondary)' }}>Qty</p>
      <p className="text-xs font-medium uppercase tracking-wider text-right" style={{ color: 'var(--portal-text-secondary)' }}>Rate</p>
      <p className="text-xs font-medium uppercase tracking-wider text-right" style={{ color: 'var(--portal-text-secondary)' }}>Total</p>
    </div>
  );
}

// =============================================================================
// Main component
// =============================================================================

export function LineItemGrid({
  items,
  className,
  style,
  onSelectionChange,
  disabled,
  eventStartTime,
  eventEndTime,
  layout = 'card',
  sectionBgAlternate = false,
  sectionTrim = 'none',
}: LineItemGridProps) {
  if (!items.length) return null;

  const isSingle = items.length === 1;
  const hasGroups = items.some((i) => (i as { display_group_name?: string | null }).display_group_name);
  const grouped = groupItems(items);

  const renderItem = (item: PublicProposalItem, i: number) => {
    switch (layout) {
      case 'row':
        return <RowItem key={item.id} item={item} i={i} disabled={disabled} onSelectionChange={onSelectionChange} />;
      case 'minimal':
        return <MinimalItem key={item.id} item={item} i={i} disabled={disabled} onSelectionChange={onSelectionChange} />;
      default:
        return <CardItem key={item.id} item={item} i={i} isSingle={isSingle} disabled={disabled} onSelectionChange={onSelectionChange} eventStartTime={eventStartTime} eventEndTime={eventEndTime} />;
    }
  };

  // Ungrouped — flat list or grid
  if (!hasGroups) {
    return (
      <div
        className={cn(
          layout === 'card'
            ? cn('grid', isSingle ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')
            : 'flex flex-col',
          className,
        )}
        style={style}
      >
        {layout === 'row' && <RowHeader />}
        {items.map((item, i) => renderItem(item, i))}
      </div>
    );
  }

  // Grouped — sections with optional background alternation
  return (
    <div className={className}>
      {grouped.map(({ groupName, groupItems: groupedItems }, groupIdx) => {
        const useSurfaceBg = sectionBgAlternate && groupIdx % 2 === 0;
        return (
          <React.Fragment key={groupName}>
            {groupIdx > 0 && <SectionTrim variant={sectionTrim} className="my-4 sm:my-6" />}
          <section
            id={`section-${slugify(groupName)}`}
            className={cn(sectionBgAlternate && 'rounded-[var(--portal-radius)] px-4 sm:px-5 py-3')}
            style={sectionBgAlternate ? {
              backgroundColor: useSurfaceBg ? 'var(--portal-surface)' : 'var(--portal-bg)',
              marginBottom: 'var(--portal-gap)',
            } : undefined}
          >
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
                layout === 'card'
                  ? cn('grid', isSingle ? 'grid-cols-1 max-w-md mx-auto' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3')
                  : 'flex flex-col',
              )}
              style={{ gap: 'var(--portal-gap)' }}
            >
              {layout === 'row' && <RowHeader />}
              {groupedItems.map((item, i) => renderItem(item, i))}
            </div>
          </section>
          </React.Fragment>
        );
      })}
    </div>
  );
}
