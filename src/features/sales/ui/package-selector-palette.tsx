/**
 * PackageSelectorPalette — Omni-Selector: floating popover for Add from Catalog.
 * Search + package list; on select shows preview (items inside); "Apply to Proposal" does deep copy.
 * Includes "+ Create Custom Line Item" at bottom.
 *
 * A11y contract (Phase 1 palette promotion):
 * - Search input is a `combobox` pointing at the `listbox` below.
 * - Package rows are `option`s with stable ids; arrow-up/down moves the
 *   active descendant, Enter selects (or commits the default option in
 *   list view), Escape closes the popover.
 * - When a package is selected the view switches to preview + Apply; the
 *   listbox is not rendered so the search input is no longer a combobox.
 * - Screen readers get a polite live region announcing loading /
 *   semantic-search status.
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo, useId } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, Plus, Check, Loader2 } from 'lucide-react';
import {
  getPackages,
  getExpandedPackageLineItems,
  addPackageToProposal,
  type ExpandedLineItem,
} from '../api/proposal-actions';
import type { Package } from '@/types/supabase';
import { Popover, PopoverContent, PopoverAnchor } from '@/shared/ui/popover';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';
import { checkBatchAvailability, type ItemAvailability } from '../api/catalog-availability';
import { semanticSearchCatalog } from '../api/catalog-embeddings';

export type PackageSelectorPaletteProps = {
  workspaceId: string;
  dealId: string;
  /** Deal proposed date — used for rental item availability checks. */
  proposedDate?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * After a package has been deep-copied onto the proposal, the parent
   * should refetch. Passes the source package id so the parent can emit
   * telemetry attributing the add to a specific catalog entry.
   */
  onApplied?: (packageId?: string) => void;
  /** Add a blank custom line item and close. */
  onAddCustomLineItem?: () => void;
  /** Render trigger (e.g. "+ Add from Catalog" button). */
  trigger: React.ReactNode;
  className?: string;
};

export function PackageSelectorPalette({
  workspaceId,
  dealId,
  proposedDate,
  open,
  onOpenChange,
  onApplied,
  onAddCustomLineItem,
  trigger,
  className,
}: PackageSelectorPaletteProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Package | null>(null);
  const [preview, setPreview] = useState<ExpandedLineItem[] | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applyError, setApplyError] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, ItemAvailability>>({});
  const [semanticResults, setSemanticResults] = useState<Package[]>([]);
  const [semanticLoading, setSemanticLoading] = useState(false);
  /** Keyboard navigation cursor into the visible option list. */
  const [activeIndex, setActiveIndex] = useState(0);

  const searchInputRef = useRef<HTMLInputElement | null>(null);
  const listboxId = useId();
  const optionIdPrefix = useId();

  const loadPackages = useCallback(async () => {
    if (!workspaceId) {
      setPackages([]);
      return;
    }
    setLoading(true);
    setError(null);
    const result = await getPackages(workspaceId);
    setPackages(result.packages ?? []);
    setError(result.error ?? null);
    setLoading(false);
  }, [workspaceId]);

  useEffect(() => {
    if (!open || !workspaceId) return;
    queueMicrotask(() => {
      loadPackages();
    });
  }, [open, workspaceId, loadPackages]);

  useEffect(() => {
    if (open) return;
    queueMicrotask(() => {
      setSelected(null);
      setPreview(null);
      setSearch('');
      setApplyError(null);
      setActiveIndex(0);
    });
  }, [open]);

  // Fetch availability for rental packages when palette has packages and a proposed date
  useEffect(() => {
    if (!proposedDate || packages.length === 0 || !workspaceId) {
      setAvailability({});
      return;
    }
    const rentalIds = packages
      .filter((p) => p.category === 'rental')
      .map((p) => p.id);
    if (rentalIds.length === 0) {
      setAvailability({});
      return;
    }
    checkBatchAvailability(workspaceId, rentalIds, proposedDate).then((result) => {
      setAvailability(result);
    });
  }, [packages, proposedDate, workspaceId]);

  // Semantic search — async, debounced, never blocks keyword filter
  useEffect(() => {
    if (!workspaceId || !open || search.trim().length < 3) {
      setSemanticResults([]);
      return;
    }
    const timer = setTimeout(async () => {
      setSemanticLoading(true);
      try {
        const results = await semanticSearchCatalog(workspaceId, search.trim(), 8);
        const keywordIds = new Set(
          packages
            .filter(
              (p) =>
                p.name.toLowerCase().includes(search.toLowerCase()) ||
                (p.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
                (p.category ?? '').toLowerCase().includes(search.toLowerCase())
            )
            .map((p) => p.id)
        );
        const semanticPkgs = results
          .filter((r) => !keywordIds.has(r.packageId))
          .map((r) => packages.find((p) => p.id === r.packageId))
          .filter(Boolean) as Package[];
        setSemanticResults(semanticPkgs);
      } catch {
        setSemanticResults([]);
      } finally {
        setSemanticLoading(false);
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [search, workspaceId, open, packages]);

  const filteredPackages = useMemo(
    () =>
      search.trim()
        ? packages.filter(
            (p) =>
              p.name.toLowerCase().includes(search.toLowerCase()) ||
              (p.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
              (p.category ?? '').toLowerCase().includes(search.toLowerCase())
          )
        : packages,
    [packages, search],
  );

  /**
   * Flat array of visible options in tab order: exact matches first, then
   * semantic "Related" matches (when search is long enough). This is what
   * arrow-key navigation walks.
   */
  const visibleOptions = useMemo<Package[]>(() => {
    const related = search.trim().length >= 3 ? semanticResults : [];
    return [...filteredPackages, ...related];
  }, [filteredPackages, semanticResults, search]);

  // Reset the active cursor when the visible list changes.
  useEffect(() => {
    setActiveIndex(0);
  }, [visibleOptions]);

  const handleSelectPackage = useCallback(async (pkg: Package) => {
    setSelected(pkg);
    setPreview(null);
    setPreviewLoading(true);
    setApplyError(null);
    const { items } = await getExpandedPackageLineItems(pkg.id);
    setPreview(items);
    setPreviewLoading(false);
  }, []);

  const handleApply = useCallback(async () => {
    if (!selected) return;
    setApplying(true);
    setApplyError(null);
    const result = await addPackageToProposal(dealId, selected.id);
    setApplying(false);
    if (result.success) {
      onApplied?.(selected.id);
      onOpenChange(false);
    } else {
      setApplyError(result.error ?? 'Failed to add to proposal.');
    }
  }, [dealId, selected, onApplied, onOpenChange]);

  const handleCustomLine = useCallback(() => {
    onAddCustomLineItem?.();
    onOpenChange(false);
  }, [onAddCustomLineItem, onOpenChange]);

  // Keyboard nav on the search input (when in list view).
  const handleSearchKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (selected) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (visibleOptions.length === 0) return;
        setActiveIndex((i) => (i + 1) % visibleOptions.length);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (visibleOptions.length === 0) return;
        setActiveIndex((i) => (i - 1 + visibleOptions.length) % visibleOptions.length);
      } else if (e.key === 'Enter') {
        const pkg = visibleOptions[activeIndex];
        if (!pkg) return;
        e.preventDefault();
        handleSelectPackage(pkg);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onOpenChange(false);
      } else if (e.key === 'Home') {
        e.preventDefault();
        setActiveIndex(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        if (visibleOptions.length > 0) setActiveIndex(visibleOptions.length - 1);
      }
    },
    [activeIndex, selected, visibleOptions, handleSelectPackage, onOpenChange],
  );

  const activeOptionId = visibleOptions[activeIndex]
    ? `${optionIdPrefix}-option-${visibleOptions[activeIndex]!.id}`
    : undefined;

  const previewSummary =
    preview && preview.length > 0
      ? preview.map((i) => `${i.quantity}× ${i.name}`).join(', ')
      : null;

  // Count of keyword matches — used to divide the listbox and tell SRs how
  // many "Related" items follow.
  const keywordMatchCount = filteredPackages.length;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      <PopoverContent
        align="center"
        sideOffset={12}
        data-surface="raised"
        onOpenAutoFocus={(e) => {
          // Keep Radix's default focus-trap, but route the initial focus to
          // the search input (combobox) rather than the first focusable child.
          e.preventDefault();
          queueMicrotask(() => searchInputRef.current?.focus());
        }}
        className={cn(
          'w-[min(420px,calc(100vw-32px))] max-h-[min(85vh,560px)] flex flex-col p-0 overflow-hidden',
          'border border-[oklch(1_0_0_/_0.08)] shadow-[0_16px_48px_-12px_oklch(0_0_0/0.4)]',
          'bg-[var(--stage-surface-raised)]',
          className
        )}
      >
        <div className="shrink-0 p-4 border-b border-[var(--stage-edge-subtle)]">
          <h3
            id={`${optionIdPrefix}-label`}
            className="text-sm font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-3"
          >
            Add from catalog
          </h3>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--stage-text-secondary)] pointer-events-none"
              strokeWidth={1.5}
              aria-hidden
            />
            <input
              ref={searchInputRef}
              type="text"
              role={selected ? undefined : 'combobox'}
              // ARIA 1.2: combobox MUST carry aria-expanded as an explicit boolean
              // whenever the role is present. Only drop it when the role flips off
              // (preview view).
              aria-expanded={selected ? undefined : open}
              aria-controls={!selected ? listboxId : undefined}
              aria-autocomplete={!selected ? 'list' : undefined}
              aria-activedescendant={!selected ? activeOptionId : undefined}
              aria-labelledby={`${optionIdPrefix}-label`}
              placeholder="Search packages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={handleSearchKeyDown}
              className="w-full pl-9 pr-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            />
          </div>
        </div>

        {/* Polite live region — narrates loading / semantic status without stealing focus. */}
        <div role="status" aria-live="polite" className="sr-only">
          {loading
            ? 'Loading catalog.'
            : selected
              ? `${selected.name} selected. Preview loading.`
              : `${filteredPackages.length} package${filteredPackages.length === 1 ? '' : 's'} matching "${search}".${
                  semanticLoading ? ' Searching related items.' : ''
                }${semanticResults.length > 0 ? ` ${semanticResults.length} related items.` : ''}`}
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-[var(--stage-text-secondary)] text-sm">
              <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} aria-hidden />
              Loading…
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-[var(--color-unusonic-error)]">{error}</p>
          ) : !selected ? (
            <ul
              id={listboxId}
              role="listbox"
              aria-labelledby={`${optionIdPrefix}-label`}
              className="p-2 space-y-1"
            >
              {visibleOptions.length === 0 ? (
                <li className="py-8 text-center text-sm text-[var(--stage-text-secondary)]" role="presentation">
                  {packages.length === 0
                    ? 'No packages yet. Add master packages in Catalog.'
                    : 'No packages match your search.'}
                </li>
              ) : (
                <>
                  {filteredPackages.map((pkg, idx) => {
                    const optionId = `${optionIdPrefix}-option-${pkg.id}`;
                    const isActive = idx === activeIndex;
                    return (
                      // Plain <li> — framer-motion `layout` on a filtered list
                      // (vs reordered) pays FLIP measurement cost per keystroke
                      // for zero visual gain at 200+ items.
                      <li
                        key={pkg.id}
                        id={optionId}
                        role="option"
                        aria-selected={isActive}
                        className={cn(
                          'flex items-center gap-3 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-3 transition-colors duration-[80ms] ease-out cursor-pointer',
                          isActive
                            ? 'border-[var(--stage-border-focus)] bg-[oklch(1_0_0_/_0.06)]'
                            : 'hover:border-[oklch(1_0_0_/_0.15)] hover:bg-[oklch(1_0_0_/_0.04)]',
                        )}
                        onMouseEnter={() => setActiveIndex(idx)}
                        onClick={() => handleSelectPackage(pkg)}
                      >
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <p className="font-medium text-[var(--stage-text-primary)] truncate text-sm">{pkg.name}</p>
                            {pkg.category === 'rental' && availability[pkg.id] && (
                              <span
                                className={cn(
                                  'inline-block w-2 h-2 rounded-full shrink-0',
                                  availability[pkg.id].status === 'available' ? 'bg-[var(--color-unusonic-success)]' :
                                  availability[pkg.id].status === 'tight' ? 'bg-[var(--color-unusonic-warning)]' : 'bg-[var(--color-unusonic-error)]'
                                )}
                                aria-hidden
                                title={
                                  availability[pkg.id].status === 'available'
                                    ? `${availability[pkg.id].available} available`
                                    : availability[pkg.id].status === 'tight'
                                      ? `${availability[pkg.id].available} of ${availability[pkg.id].stockQuantity} remaining`
                                      : `Fully booked (${availability[pkg.id].totalAllocated} allocated, ${availability[pkg.id].stockQuantity} in stock)`
                                }
                              />
                            )}
                          </div>
                          {pkg.description && (
                            <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">{pkg.description}</p>
                          )}
                          {pkg.category === 'rental' && availability[pkg.id] && availability[pkg.id].status !== 'available' && (
                            <p className={cn(
                              'text-xs mt-0.5',
                              availability[pkg.id].status === 'tight' ? 'text-[var(--color-unusonic-warning)]' : 'text-[var(--color-unusonic-error)]'
                            )}>
                              {availability[pkg.id].status === 'shortage'
                                ? 'Fully booked'
                                : `${availability[pkg.id].available} of ${availability[pkg.id].stockQuantity} remaining`}
                            </p>
                          )}
                          <p className="text-sm font-medium text-[var(--stage-text-primary)] tabular-nums mt-1">
                            ${Number(pkg.price).toLocaleString()}
                          </p>
                        </div>
                        <Plus className="w-4 h-4 text-[var(--stage-text-secondary)] shrink-0" strokeWidth={1.5} aria-hidden />
                      </li>
                    );
                  })}
                  {search.trim().length >= 3 && semanticResults.length > 0 && (
                    <>
                      <li className="flex items-center gap-3 py-1.5 px-2" role="presentation">
                        <div className="h-px flex-1 bg-[oklch(1_0_0_/_0.08)]" aria-hidden />
                        <span className="stage-label">
                          Related
                        </span>
                        <div className="h-px flex-1 bg-[oklch(1_0_0_/_0.08)]" aria-hidden />
                      </li>
                      {semanticResults.map((pkg, relIdx) => {
                        const flatIdx = keywordMatchCount + relIdx;
                        const optionId = `${optionIdPrefix}-option-${pkg.id}`;
                        const isActive = flatIdx === activeIndex;
                        return (
                          <li
                            key={`semantic-${pkg.id}`}
                            id={optionId}
                            role="option"
                            aria-selected={isActive}
                            className={cn(
                              'flex items-center gap-3 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-3 transition-colors duration-[80ms] ease-out cursor-pointer opacity-75',
                              isActive
                                ? 'border-[var(--stage-border-focus)] bg-[oklch(1_0_0_/_0.06)] opacity-100'
                                : 'hover:border-[oklch(1_0_0_/_0.15)] hover:bg-[oklch(1_0_0_/_0.04)]',
                            )}
                            onMouseEnter={() => setActiveIndex(flatIdx)}
                            onClick={() => handleSelectPackage(pkg)}
                          >
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1.5">
                                <p className="font-medium text-[var(--stage-text-primary)] truncate text-sm">{pkg.name}</p>
                                <span className="shrink-0 px-1.5 py-0.5 rounded-md bg-[oklch(1_0_0_/_0.06)] stage-label">
                                  AI
                                </span>
                              </div>
                              {pkg.description && (
                                <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">{pkg.description}</p>
                              )}
                              <p className="text-sm font-medium text-[var(--stage-text-primary)] tabular-nums mt-1">
                                ${Number(pkg.price).toLocaleString()}
                              </p>
                            </div>
                            <Plus className="w-4 h-4 text-[var(--stage-text-secondary)] shrink-0" strokeWidth={1.5} aria-hidden />
                          </li>
                        );
                      })}
                    </>
                  )}
                  {semanticLoading && search.trim().length >= 3 && (
                    <li className="py-2 text-center text-xs text-[var(--stage-text-secondary)]" role="presentation">
                      Searching with Aion…
                    </li>
                  )}
                </>
              )}
            </ul>
          ) : (
            <AnimatePresence mode="wait">
              <motion.div
                key={selected.id}
                initial={{ opacity: 0, x: 8 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -8 }}
                transition={STAGE_LIGHT}
                className="p-4 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setPreview(null);
                    }}
                    className="text-xs font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
                  >
                    ← Back to list
                  </button>
                </div>
                <div className="rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-4">
                  <p className="font-medium text-[var(--stage-text-primary)] text-sm">{selected.name}</p>
                  <p className="text-sm font-medium text-[var(--stage-text-primary)] tabular-nums mt-1">
                    ${Number(selected.price).toLocaleString()}
                  </p>
                  {previewLoading ? (
                    <div className="flex items-center gap-2 mt-3 text-[var(--stage-text-secondary)] text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} />
                      Loading preview…
                    </div>
                  ) : previewSummary ? (
                    <p className="mt-3 text-xs text-[var(--stage-text-secondary)] leading-relaxed">
                      Includes: {previewSummary}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-[var(--stage-text-secondary)]">Single item</p>
                  )}
                </div>
                {applyError && (
                  <p className="text-sm text-[var(--color-unusonic-error)]" role="alert">
                    {applyError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applying}
                  className="stage-btn stage-btn-primary w-full inline-flex items-center justify-center gap-2"
                >
                  {applying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} aria-hidden />
                      Applying…
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                      Apply to proposal
                    </>
                  )}
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <div className="shrink-0 p-3 border-t border-[var(--stage-edge-subtle)]">
          <button
            type="button"
            onClick={handleCustomLine}
            className="stage-btn stage-btn-ghost w-full inline-flex items-center justify-center gap-2 border border-dashed border-[oklch(1_0_0_/_0.15)] hover:border-[oklch(1_0_0_/_0.25)]"
          >
            <Plus className="w-4 h-4" strokeWidth={1.5} aria-hidden />
            Create custom line item
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
