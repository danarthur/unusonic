'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search } from 'lucide-react';
import { StreamCard, type StreamCardItem } from './stream-card';
import { CreateGigModal } from './create-gig-modal';
import {
  FilterChipBar,
  INITIAL_FILTERS,
  hasActiveFilters,
  applyFilters,
  type StreamFilters,
} from './stream-filter-chips';
import {
  SortControl,
  INITIAL_SORT,
  applySortOrder,
  type StreamSort,
} from './stream-sort-control';
import type { OptimisticUpdate } from './crm-production-queue';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

export type StreamMode = 'inquiry' | 'active' | 'past';

const STREAM_TABS = [
  { value: 'inquiry' as const, label: 'Inquiry' },
  { value: 'active' as const, label: 'Active' },
  { value: 'past' as const, label: 'Past' },
] as const;

function filterByMode(items: StreamCardItem[], mode: StreamMode): StreamCardItem[] {
  const today = new Date().toISOString().slice(0, 10);
  if (mode === 'inquiry') {
    // Only pre-sale deals that haven't passed their date yet (or have no date)
    return items.filter(
      (i) =>
        i.source === 'deal' &&
        (i.status === 'inquiry' || i.status === 'proposal') &&
        (i.event_date == null || i.event_date >= today)
    );
  }
  if (mode === 'active') {
    return items.filter(
      (i) =>
        (i.source === 'event' &&
          i.lifecycle_status !== 'cancelled' &&
          (i.event_date == null || i.event_date >= today)) ||
        (i.source === 'deal' &&
          (i.status === 'contract_sent' || i.status === 'contract_signed' || i.status === 'deposit_received') &&
          (i.event_date == null || i.event_date >= today))
    );
  }
  if (mode === 'past') {
    return items.filter(
      (i) =>
        // Won or lost deals
        (i.source === 'deal' && (i.status === 'won' || i.status === 'lost')) ||
        // Past-dated deals that never converted (any pre-handover status)
        (i.source === 'deal' &&
          (i.status === 'inquiry' || i.status === 'proposal' || i.status === 'contract_sent' || i.status === 'contract_signed' || i.status === 'deposit_received') &&
          i.event_date != null &&
          i.event_date < today) ||
        // Cancelled events (regardless of date)
        (i.source === 'event' && i.lifecycle_status === 'cancelled') ||
        // Past-dated events (must have a date — dateless events stay in Active)
        (i.source === 'event' &&
          i.lifecycle_status !== 'cancelled' &&
          i.event_date != null &&
          i.event_date < today)
    );
  }
  return items;
}

export function Stream({
  items,
  selectedId,
  onSelect,
  addOptimisticGig,
  onRefetchList,
  mode,
  onModeChange,
  className,
}: {
  items: StreamCardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  addOptimisticGig: (update: OptimisticUpdate) => void;
  onRefetchList?: () => Promise<void>;
  mode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
  className?: string;
}) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<StreamFilters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<StreamSort>(INITIAL_SORT);
  const [sortBeforeAttention, setSortBeforeAttention] = useState<StreamSort | null>(null);

  const handleFiltersChange = (newFilters: StreamFilters) => {
    const wasAttention = filters.needsAttention;
    const isAttention = newFilters.needsAttention;

    if (!wasAttention && isAttention) {
      // Entering attention mode — save current sort, switch to priority
      setSortBeforeAttention(sort);
      setSort({ field: 'priority', direction: 'desc' });
    } else if (wasAttention && !isAttention) {
      // Leaving attention mode — restore previous sort
      if (sortBeforeAttention) {
        setSort(sortBeforeAttention);
        setSortBeforeAttention(null);
      }
    }

    setFilters(newFilters);
  };

  const today = new Date().toISOString().slice(0, 10);
  const tagged: StreamCardItem[] = items.map((i) => {
    let tag: 'sales' | 'ops' | 'finance' = 'ops';
    if (i.source === 'deal') {
      tag = i.status === 'won' || i.status === 'lost' ? 'ops' : 'sales';
    } else {
      tag = (i.event_date ?? '') < today ? 'finance' : 'ops';
    }
    return { ...i, mode: tag };
  });

  const modeFiltered = filterByMode(tagged, mode);

  // Layer 1: apply chip filters
  const chipFiltered = applyFilters(modeFiltered, filters);

  // Layer 3: apply search — expanded to match archetype, lead source, owner name
  const q = searchQuery.trim().toLowerCase();
  const searched = q
    ? chipFiltered.filter(
        (i) =>
          (i.title ?? '').toLowerCase().includes(q) ||
          (i.client_name ?? '').toLowerCase().includes(q) ||
          (i.location ?? '').toLowerCase().includes(q) ||
          (i.event_archetype ?? '').toLowerCase().includes(q) ||
          (i.lead_source ?? '').toLowerCase().includes(q) ||
          (i.owner_name ?? '').toLowerCase().includes(q)
      )
    : chipFiltered;

  // Layer 2: apply sort — force priority when needs-attention filter is active
  const effectiveSort: StreamSort = filters.needsAttention
    ? { field: 'priority', direction: 'desc' }
    : sort;
  const filtered = applySortOrder(searched, effectiveSort);

  const filtersActive = hasActiveFilters(filters);
  const hasResults = modeFiltered.length > 0 || searchQuery.length > 0 || filtersActive;

  return (
    <div className={cn('flex flex-col h-full min-h-0', className)} data-surface="surface" style={{ background: 'var(--stage-surface)' }}>
      <header className="shrink-0 flex flex-col gap-4 p-4">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h1 className="text-xl font-medium tracking-tight leading-none" style={{ color: 'var(--stage-text-primary)' }}>
              Productions
            </h1>
            <p className="text-sm leading-relaxed mt-1" style={{ color: 'var(--stage-text-secondary)' }}>
              {items.length === 0
                ? 'No productions yet.'
                : 'Inquiry to wrap.'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setCreateModalOpen(true)}
            className="stage-btn stage-btn-primary"
          >
            <Plus size={16} aria-hidden /> New production
          </button>
        </div>

        {/* Stream Mode: underline-style tabs */}
        <div
          className="relative flex"
          role="tablist"
          aria-label="Filter stream"
        >
          {STREAM_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              role="tab"
              aria-selected={mode === tab.value}
              onClick={() => {
                onModeChange(tab.value);
                setSearchQuery('');
                setFilters(INITIAL_FILTERS);
                if (sortBeforeAttention) {
                  setSort(sortBeforeAttention);
                  setSortBeforeAttention(null);
                }
              }}
              className={cn(
                'relative flex-1 py-2.5 text-sm font-medium tracking-tight transition-colors focus:outline-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                mode === tab.value
                  ? 'text-[var(--stage-text-primary)]'
                  : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]'
              )}
            >
              {tab.label}
              {mode === tab.value && (
                <motion.div
                  layoutId="stream-mode-indicator"
                  className="absolute bottom-0 left-2 right-2 h-[2px]"
                  style={{ background: 'var(--stage-accent)' }}
                  transition={STAGE_LIGHT}
                />
              )}
            </button>
          ))}
          <div className="absolute bottom-0 left-0 right-0 h-px" style={{ background: 'var(--stage-edge-subtle)' }} />
        </div>
      </header>

      {/* Filter chips + search + sort */}
      {hasResults && (
        <div className="shrink-0 px-4 flex flex-col gap-3 pb-3">
          {/* Layer 1: Filter chips */}
          <FilterChipBar
            filters={filters}
            onFiltersChange={handleFiltersChange}
            items={modeFiltered}
          />

          {/* Search + Sort row */}
          <div className="flex items-center gap-2">
            <div className="relative flex-1 flex items-center">
              <Search
                size={14}
                className="absolute left-3 pointer-events-none shrink-0"
                style={{ color: 'var(--stage-text-secondary)' }}
                aria-hidden
              />
              <input
                type="search"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search productions…"
                className="w-full pl-8 pr-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)]/30"
                style={{
                  background: 'var(--stage-surface-elevated)',
                  borderRadius: 'var(--stage-radius-input, 6px)',
                  border: '1px solid var(--stage-edge-subtle)',
                }}
              />
            </div>
            <SortControl sort={sort} onSortChange={setSort} />
          </div>

          {/* Layer 3: Result count */}
          {(q || filtersActive) && (
            <p className="text-[10px] tabular-nums" style={{ color: 'var(--stage-text-tertiary)' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              {filtersActive && !q && ' (filtered)'}
            </p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <ul
          key={`stream-list-${mode}`}
          className="flex flex-col gap-3"
        >
          {filtered.map((item) => (
            <li
              key={`${item.source}-${item.id}`}
            >
              <StreamCard
                item={item}
                selected={selectedId === item.id}
                onClick={() => onSelect(item.id)}
              />
            </li>
          ))}

          {filtered.length === 0 && (
            <motion.li
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center text-sm py-12 list-none"
              style={{ color: 'var(--stage-text-secondary)' }}
            >
              {searchQuery || filtersActive ? (
                <span>
                  No results.{' '}
                  {filtersActive && (
                    <button
                      type="button"
                      onClick={() => {
                        setFilters(INITIAL_FILTERS);
                        setSearchQuery('');
                        if (sortBeforeAttention) {
                          setSort(sortBeforeAttention);
                          setSortBeforeAttention(null);
                        }
                      }}
                      className="underline"
                      style={{ color: 'var(--stage-text-primary)' }}
                    >
                      Clear filters
                    </button>
                  )}
                </span>
              ) : (
                'No matching productions.'
              )}
            </motion.li>
          )}
        </ul>
      </div>

      <CreateGigModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        addOptimisticGig={addOptimisticGig}
        onRefetchList={onRefetchList}
      />
    </div>
  );
}
