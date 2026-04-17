'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { Plus, Search, Layers } from 'lucide-react';
import { StreamCard, type StreamCardItem } from './stream-card';
import { CreateGigModal } from './create-gig-modal';
import { CrossShowResourceModal } from './cross-show-resource-modal';
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
import type { WorkspacePipelineStage } from '../actions/get-workspace-pipeline-stages';
import { filterByMode, type StreamMode } from './stream-filter';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

export type { StreamMode };

const STREAM_TABS = [
  { value: 'inquiry' as const, label: 'Inquiry' },
  { value: 'active' as const, label: 'Active' },
  { value: 'past' as const, label: 'Past' },
] as const;

export function Stream({
  items,
  selectedId,
  onSelect,
  addOptimisticGig,
  onRefetchList,
  mode,
  onModeChange,
  sourceOrgId,
  pipelineStages,
  className,
}: {
  items: StreamCardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  addOptimisticGig: (update: OptimisticUpdate) => void;
  onRefetchList?: () => Promise<void>;
  mode: StreamMode;
  onModeChange: (mode: StreamMode) => void;
  sourceOrgId?: string | null;
  /** Phase 3h: workspace pipeline stages — drives Stream tab classification. */
  pipelineStages?: readonly WorkspacePipelineStage[];
  className?: string;
}) {
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filters, setFilters] = useState<StreamFilters>(INITIAL_FILTERS);
  const [sort, setSort] = useState<StreamSort>(INITIAL_SORT);
  const [sortBeforeAttention, setSortBeforeAttention] = useState<StreamSort | null>(null);
  const [dayViewDate, setDayViewDate] = useState<string | null>(null);

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
  // Phase 3i: mode-tagging keys on stage.kind ('won' | 'lost') rather than
  // the legacy status slug. Fall back to status for deals whose stage_id
  // isn't in the pipelineStages lookup (seeded legacy data, etc.).
  const stageKindById = new Map<string, 'working' | 'won' | 'lost'>();
  for (const s of pipelineStages ?? []) stageKindById.set(s.id, s.kind);
  const tagged: StreamCardItem[] = items.map((i) => {
    let tag: 'sales' | 'ops' | 'finance' = 'ops';
    if (i.source === 'deal') {
      const kind = i.stage_id ? stageKindById.get(i.stage_id) : undefined;
      const terminal = kind === 'won' || kind === 'lost'
        || i.status === 'won' || i.status === 'lost';
      tag = terminal ? 'ops' : 'sales';
    } else {
      tag = (i.event_date ?? '') < today ? 'finance' : 'ops';
    }
    return { ...i, mode: tag };
  });

  const modeFiltered = filterByMode(tagged, mode, pipelineStages ?? []);

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
            <h1 className="stage-readout-lg leading-none">
              Productions
            </h1>
            <p className="stage-label leading-relaxed mt-1">
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
                className="w-full pl-8 pr-3 py-2 text-sm text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none focus:border-[var(--stage-accent)] focus:shadow-[0_0_0_1px_oklch(0.90_0_0_/_0.15)] hover:border-[oklch(1_0_0_/_0.15)]"
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
            <p className="text-label tabular-nums" style={{ color: 'var(--stage-text-tertiary)' }}>
              {filtered.length} result{filtered.length !== 1 ? 's' : ''}
              {filtersActive && !q && ' (filtered)'}
            </p>
          )}
        </div>
      )}

      <div className="flex-1 min-h-0 overflow-y-auto p-4">
        <DateGroupedList
          items={filtered}
          selectedId={selectedId}
          onSelect={onSelect}
          searchQuery={searchQuery}
          filtersActive={filtersActive}
          onClearFilters={() => {
            setFilters(INITIAL_FILTERS);
            setSearchQuery('');
            if (sortBeforeAttention) {
              setSort(sortBeforeAttention);
              setSortBeforeAttention(null);
            }
          }}
          onOpenDayView={setDayViewDate}
          mode={mode}
        />
      </div>

      <CreateGigModal
        open={createModalOpen}
        onClose={() => setCreateModalOpen(false)}
        addOptimisticGig={addOptimisticGig}
        onRefetchList={onRefetchList}
      />

      <CrossShowResourceModal
        open={!!dayViewDate}
        onClose={() => setDayViewDate(null)}
        date={dayViewDate ?? ''}
        sourceOrgId={sourceOrgId ?? null}
      />
    </div>
  );
}

// =============================================================================
// DateGroupedList — renders stream cards with date group headers.
// When a date has 2+ items, the header shows a "Day view" link.
// =============================================================================

function formatGroupDate(iso: string): string {
  const d = new Date(iso + 'T00:00:00');
  return d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

function DateGroupedList({
  items,
  selectedId,
  onSelect,
  searchQuery,
  filtersActive,
  onClearFilters,
  onOpenDayView,
  mode,
}: {
  items: StreamCardItem[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  searchQuery: string;
  filtersActive: boolean;
  onClearFilters: () => void;
  onOpenDayView: (date: string) => void;
  mode: string;
}) {
  // Build date groups: { date: string | null, items: StreamCardItem[] }[]
  // Items are already sorted, so we preserve order and insert headers between date changes.
  const groups = useMemo(() => {
    const result: { date: string | null; items: StreamCardItem[] }[] = [];
    let currentDate: string | null | undefined = undefined;
    let currentGroup: StreamCardItem[] = [];

    for (const item of items) {
      const d = item.event_date ?? null;
      if (d !== currentDate) {
        if (currentGroup.length > 0) {
          result.push({ date: currentDate ?? null, items: currentGroup });
        }
        currentDate = d;
        currentGroup = [item];
      } else {
        currentGroup.push(item);
      }
    }
    if (currentGroup.length > 0) {
      result.push({ date: currentDate ?? null, items: currentGroup });
    }
    return result;
  }, [items]);

  // Count items per date for day-view trigger
  const dateCountMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const item of items) {
      if (item.event_date) {
        map.set(item.event_date, (map.get(item.event_date) ?? 0) + 1);
      }
    }
    return map;
  }, [items]);

  return (
    <ul
      key={`stream-list-${mode}`}
      className="flex flex-col gap-3"
    >
      {groups.map((group) => (
        <li key={group.date ?? 'no-date'} className="flex flex-col gap-3">
          {/* Date group header */}
          {group.date && (
            <div className="flex items-center justify-between gap-2 px-1 pt-1">
              <span
                className="stage-label"
                style={{ color: 'var(--stage-text-tertiary)' }}
              >
                {formatGroupDate(group.date)}
              </span>
              {(dateCountMap.get(group.date) ?? 0) >= 2 && (
                <button
                  type="button"
                  onClick={() => onOpenDayView(group.date!)}
                  className="flex items-center gap-1 px-1.5 py-0.5 stage-badge-text font-medium transition-colors stage-hover overflow-hidden"
                  style={{
                    color: 'var(--stage-text-secondary)',
                    borderRadius: 'var(--stage-radius-input, 6px)',
                  }}
                >
                  <Layers size={10} />
                  Day view
                </button>
              )}
            </div>
          )}

          {/* Cards in this date group */}
          {group.items.map((item) => (
            <StreamCard
              key={`${item.source}-${item.id}`}
              item={item}
              selected={selectedId === item.id}
              onClick={() => onSelect(item.id)}
            />
          ))}
        </li>
      ))}

      {items.length === 0 && (
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
                  onClick={onClearFilters}
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
  );
}
