/**
 * Catalog toolbar — search, category tabs, tag filters, archived toggle, view mode.
 */

'use client';

import { CalendarDays, Eye, EyeOff, LayoutGrid, LayoutList, Upload } from 'lucide-react';
import type { PackageCategory } from '@/features/sales/api/package-actions';
import type { WorkspaceTag } from '@/features/sales/api/workspace-tag-actions';
import { cn } from '@/shared/lib/utils';

type CatalogTab = 'all' | PackageCategory;

const CATALOG_TABS: { value: CatalogTab; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'package', label: 'Packages' },
  { value: 'service', label: 'Services' },
  { value: 'rental', label: 'Rentals' },
  { value: 'talent', label: 'Talent' },
  { value: 'retail_sale', label: 'Retail' },
  { value: 'fee', label: 'Fees' },
];

interface CatalogToolbarProps {
  activeCategoryTab: CatalogTab;
  onCategoryChange: (tab: CatalogTab) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  allTags: WorkspaceTag[];
  tagFilterId: string | null;
  onTagFilterChange: (id: string | null) => void;
  showArchived: boolean;
  onShowArchivedChange: (v: boolean) => void;
  viewMode: 'grid' | 'table' | 'timeline';
  onViewModeChange: (mode: 'grid' | 'table' | 'timeline') => void;
  onImportClick?: () => void;
  exportSlot?: React.ReactNode;
  rebuildSlot?: React.ReactNode;
  searchInputRef?: React.RefObject<HTMLInputElement | null>;
  /** Slot for the smart view bar — renders between category tabs and search row. */
  smartViewSlot?: React.ReactNode;
}

export function CatalogToolbar({
  activeCategoryTab,
  onCategoryChange,
  searchQuery,
  onSearchChange,
  allTags,
  tagFilterId,
  onTagFilterChange,
  showArchived,
  onShowArchivedChange,
  viewMode,
  onViewModeChange,
  onImportClick,
  exportSlot,
  rebuildSlot,
  searchInputRef,
  smartViewSlot,
}: CatalogToolbarProps) {
  return (
    <>
      {/* Category tabs */}
      <div
        role="tablist"
        aria-label="Catalog category"
        className="flex flex-wrap gap-1 border-b border-[oklch(1_0_0_/_0.08)] pb-2"
      >
        {CATALOG_TABS.map((tab) => (
          <button
            key={tab.value}
            type="button"
            role="tab"
            aria-selected={activeCategoryTab === tab.value}
            onClick={() => onCategoryChange(tab.value)}
            className={cn(
              'px-4 py-2.5 rounded-t-[var(--stage-radius-nested)] text-sm font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              activeCategoryTab === tab.value
                ? 'bg-[var(--stage-surface)] border border-[oklch(1_0_0_/_0.08)] border-b-transparent -mb-0.5 text-[var(--stage-text-primary)]'
                : 'border border-transparent text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Smart views */}
      {smartViewSlot}

      {/* Search + tag filter + view toggle */}
      <div className="flex flex-wrap items-center gap-3">
        <input
          ref={searchInputRef}
          type="search"
          value={searchQuery}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Search catalog... ( / )"
          className="flex-1 min-w-[200px] max-w-md px-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-elevated)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          aria-label="Search catalog"
        />
        {allTags.length > 0 && (
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
              Tag
            </span>
            <button
              type="button"
              onClick={() => onTagFilterChange(null)}
              className={cn(
                'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                tagFilterId === null
                  ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.24)]'
                  : 'border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
              )}
            >
              All
            </button>
            {allTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => onTagFilterChange(tag.id)}
                className={cn(
                  'px-3 py-1.5 rounded-full text-xs font-medium transition-colors',
                  tagFilterId === tag.id
                    ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.24)]'
                    : 'border border-[oklch(1_0_0_/_0.08)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
                )}
              >
                {tag.label}
              </button>
            ))}
          </div>
        )}
        <button
          type="button"
          onClick={() => onShowArchivedChange(!showArchived)}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2.5 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
            showArchived
              ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.24)]'
              : 'border border-transparent text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
          )}
          aria-pressed={showArchived}
        >
          {showArchived ? (
            <Eye size={14} strokeWidth={1.5} aria-hidden />
          ) : (
            <EyeOff size={14} strokeWidth={1.5} aria-hidden />
          )}
          Archived
        </button>
        {/* CSV actions */}
        {onImportClick && (
          <button
            type="button"
            onClick={onImportClick}
            className={cn(
              'inline-flex items-center gap-1.5 px-3 py-2.5 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors',
              'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
            )}
          >
            <Upload size={16} strokeWidth={1.5} />
            Import
          </button>
        )}
        {exportSlot}
        {rebuildSlot}
        <div className="flex items-center gap-0.5 ml-auto" role="group" aria-label="View mode">
          <button
            type="button"
            onClick={() => onViewModeChange('grid')}
            className={cn(
              'p-2.5 rounded-[var(--stage-radius-nested)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              viewMode === 'grid'
                ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.24)]'
                : 'border border-transparent text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
            )}
            aria-label="Card grid view"
            aria-pressed={viewMode === 'grid'}
          >
            <LayoutGrid size={18} strokeWidth={1.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('table')}
            className={cn(
              'p-2.5 rounded-[var(--stage-radius-nested)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              viewMode === 'table'
                ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.24)]'
                : 'border border-transparent text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
            )}
            aria-label="Table view"
            aria-pressed={viewMode === 'table'}
          >
            <LayoutList size={18} strokeWidth={1.5} aria-hidden />
          </button>
          <button
            type="button"
            onClick={() => onViewModeChange('timeline')}
            className={cn(
              'p-2.5 rounded-[var(--stage-radius-nested)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              viewMode === 'timeline'
                ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.24)]'
                : 'border border-transparent text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)]',
            )}
            aria-label="Timeline view"
            aria-pressed={viewMode === 'timeline'}
          >
            <CalendarDays size={18} strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      </div>
    </>
  );
}
