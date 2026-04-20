'use client';

/**
 * ProposalCatalogPanel — collapsible left panel with a Catalog / Inspector tab
 * switcher. Opens the full catalog for browse-and-add (Discoverer persona)
 * while the ⌘K palette stays as the Speed-runner's accelerator. When a line
 * item is selected on the receipt, the parent flips the active tab to
 * Inspector and renders the existing `ProposalLineInspector` inside the
 * Inspector pane so the panel doubles as the detail editor.
 *
 * Add flow: click-to-add. No drag. Click "+" on a package → server deep-copy
 * via `addPackageToProposal` → `onProposalRefetch` fires → receipt updates.
 *
 * Scope (Phase C1):
 *   - Flat list grouped by category (sticky headers, not collapsible yet)
 *   - Simple text search (semantic search still lives in the ⌘K palette)
 *   - Availability dots on rental packages
 *   - Reuses `getPackages`, `addPackageToProposal`, `checkBatchAvailability`
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import { ChevronsLeft, ChevronsRight, Loader2, Plus, Search } from 'lucide-react';
import {
  getPackages,
  addPackageToProposal,
} from '../api/proposal-actions';
import {
  checkBatchAvailability,
  type ItemAvailability,
} from '../api/catalog-availability';
import type { Package } from '@/types/supabase';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

export type ProposalCatalogPanelTab = 'catalog' | 'inspector';

export interface ProposalCatalogPanelProps {
  workspaceId: string;
  dealId: string;
  proposedDate?: string | null;
  /** Open = panel takes its full width; closed = collapsed to an icon rail. */
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Which tab is active: Catalog (browse) or Inspector (edit selected row). */
  activeTab: ProposalCatalogPanelTab;
  onActiveTabChange: (tab: ProposalCatalogPanelTab) => void;
  /** Rendered inside the Inspector tab body. Parent supplies the actual inspector. */
  inspectorContent: React.ReactNode | null;
  /** Whether the Inspector tab is available (i.e. a line item is selected). */
  inspectorAvailable: boolean;
  /** Called after a package is added so the parent can refetch. */
  onProposalRefetch?: () => void;
  /** Called after a package add so the parent can emit telemetry. */
  onItemAdded?: (packageId?: string) => void;
  /** Add a blank custom line item and close the catalog panel (optional). */
  onAddCustomLineItem?: () => void;
  readOnly?: boolean;
}

const PANEL_WIDTH_OPEN = 400;
const PANEL_WIDTH_CLOSED = 48;

export function ProposalCatalogPanel({
  workspaceId,
  dealId,
  proposedDate,
  open,
  onOpenChange,
  activeTab,
  onActiveTabChange,
  inspectorContent,
  inspectorAvailable,
  onProposalRefetch,
  onItemAdded,
  onAddCustomLineItem,
  readOnly = false,
}: ProposalCatalogPanelProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [availability, setAvailability] = useState<Record<string, ItemAvailability>>({});

  useEffect(() => {
    if (!workspaceId || !open) return;
    let cancelled = false;
    // queueMicrotask desyncs the setState from the effect body so lint
    // (react-hooks/purity) doesn't flag a cascading-render concern. Matches
    // the pattern in package-selector-palette.tsx.
    queueMicrotask(() => {
      if (cancelled) return;
      setLoading(true);
    });
    getPackages(workspaceId)
      .then((result) => {
        if (cancelled) return;
        setPackages(result.packages ?? []);
      })
      .finally(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [workspaceId, open]);

  // Availability for rental packages (same pattern as the ⌘K palette).
  useEffect(() => {
    if (!proposedDate || packages.length === 0 || !workspaceId || !open) {
      queueMicrotask(() => setAvailability({}));
      return;
    }
    const rentalIds = packages.filter((p) => p.category === 'rental').map((p) => p.id);
    if (rentalIds.length === 0) {
      queueMicrotask(() => setAvailability({}));
      return;
    }
    checkBatchAvailability(workspaceId, rentalIds, proposedDate).then(setAvailability);
  }, [packages, proposedDate, workspaceId, open]);

  const handleAdd = useCallback(
    async (pkg: Package) => {
      if (readOnly || applyingId) return;
      setApplyingId(pkg.id);
      const result = await addPackageToProposal(dealId, pkg.id);
      setApplyingId(null);
      if (result.success) {
        onItemAdded?.(pkg.id);
        onProposalRefetch?.();
      }
    },
    [applyingId, dealId, onItemAdded, onProposalRefetch, readOnly],
  );

  const filteredPackages = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return packages;
    return packages.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        (p.description ?? '').toLowerCase().includes(q) ||
        (p.category ?? '').toLowerCase().includes(q),
    );
  }, [packages, search]);

  // Group filtered packages by category for sticky-header rendering.
  const grouped = useMemo(() => {
    const byCategory = new Map<string, Package[]>();
    for (const pkg of filteredPackages) {
      const cat = pkg.category ?? 'other';
      if (!byCategory.has(cat)) byCategory.set(cat, []);
      byCategory.get(cat)!.push(pkg);
    }
    return Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [filteredPackages]);

  return (
    <motion.aside
      animate={{ width: open ? PANEL_WIDTH_OPEN : PANEL_WIDTH_CLOSED }}
      transition={STAGE_LIGHT}
      initial={false}
      data-surface="elevated"
      className="shrink-0 overflow-hidden flex flex-col rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]"
      style={{ width: open ? PANEL_WIDTH_OPEN : PANEL_WIDTH_CLOSED }}
    >
      {open ? (
        <>
          {/* Tab bar + collapse button */}
          <div className="shrink-0 flex items-center justify-between gap-2 px-2 pt-2">
            <div className="flex items-center gap-1" role="tablist" aria-label="Panel tabs">
              <TabButton
                active={activeTab === 'catalog'}
                onClick={() => onActiveTabChange('catalog')}
              >
                Catalog
              </TabButton>
              <TabButton
                active={activeTab === 'inspector'}
                disabled={!inspectorAvailable}
                onClick={() => onActiveTabChange('inspector')}
                title={inspectorAvailable ? undefined : 'Select a line item to edit'}
              >
                Inspector
              </TabButton>
            </div>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              aria-label="Collapse panel"
              className="p-1.5 rounded text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
            >
              <ChevronsLeft className="w-4 h-4" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          {/* Tab body */}
          {activeTab === 'catalog' ? (
            <div className="flex-1 min-h-0 flex flex-col">
              {/* Search */}
              <div className="shrink-0 px-3 pt-3 pb-2">
                <div className="relative">
                  <Search
                    className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--stage-text-secondary)] pointer-events-none"
                    strokeWidth={1.5}
                    aria-hidden
                  />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search catalog"
                    className="w-full pl-8 pr-3 py-2 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                    aria-label="Search catalog"
                  />
                </div>
              </div>

              {/* List */}
              <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-[var(--stage-text-secondary)] text-sm">
                    <Loader2 className="w-4 h-4 animate-spin" strokeWidth={1.5} aria-hidden />
                    Loading catalog…
                  </div>
                ) : grouped.length === 0 ? (
                  <div className="py-12 text-center text-sm text-[var(--stage-text-secondary)]">
                    {packages.length === 0
                      ? 'No packages yet. Add master packages in Catalog.'
                      : 'No packages match your search.'}
                  </div>
                ) : (
                  <ul className="space-y-4">
                    {grouped.map(([category, items]) => (
                      <li key={category}>
                        <div className="sticky top-0 z-[1] -mx-2 px-4 py-1.5 bg-[var(--stage-surface-elevated)]/95 backdrop-blur-sm border-b border-[var(--stage-edge-subtle)]">
                          <span className="stage-label text-[var(--stage-text-secondary)]">
                            {formatCategory(category)}
                          </span>
                        </div>
                        <ul className="mt-2 space-y-1">
                          {items.map((pkg) => {
                            const avail = pkg.category === 'rental' ? availability[pkg.id] : undefined;
                            const isApplying = applyingId === pkg.id;
                            return (
                              <li key={pkg.id}>
                                <button
                                  type="button"
                                  onClick={() => handleAdd(pkg)}
                                  disabled={readOnly || isApplying}
                                  className={cn(
                                    'w-full flex items-start gap-3 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)] hover:border-[oklch(1_0_0_/_0.15)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors p-2.5 text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                                    isApplying && 'opacity-60 pointer-events-none',
                                  )}
                                >
                                  <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-1.5">
                                      <p className="font-medium text-[var(--stage-text-primary)] truncate text-sm">
                                        {pkg.name}
                                      </p>
                                      {avail && (
                                        <span
                                          className={cn(
                                            'inline-block w-2 h-2 rounded-full shrink-0',
                                            avail.status === 'available'
                                              ? 'bg-[var(--color-unusonic-success)]'
                                              : avail.status === 'tight'
                                                ? 'bg-[var(--color-unusonic-warning)]'
                                                : 'bg-[var(--color-unusonic-error)]',
                                          )}
                                          aria-hidden
                                          title={
                                            avail.status === 'available'
                                              ? `${avail.available} available`
                                              : avail.status === 'tight'
                                                ? `${avail.available} of ${avail.stockQuantity} remaining`
                                                : `Fully booked`
                                          }
                                        />
                                      )}
                                    </div>
                                    {pkg.description && (
                                      <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">
                                        {pkg.description}
                                      </p>
                                    )}
                                    <p className="text-sm text-[var(--stage-text-primary)] tabular-nums font-medium mt-1">
                                      ${Number(pkg.price).toLocaleString()}
                                    </p>
                                  </div>
                                  {isApplying ? (
                                    <Loader2 className="w-4 h-4 text-[var(--stage-text-secondary)] animate-spin shrink-0 mt-1" strokeWidth={1.5} aria-hidden />
                                  ) : (
                                    <Plus className="w-4 h-4 text-[var(--stage-text-secondary)] shrink-0 mt-1" strokeWidth={1.5} aria-hidden />
                                  )}
                                </button>
                              </li>
                            );
                          })}
                        </ul>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              {/* Custom line item — bottom-docked action. */}
              {onAddCustomLineItem && !readOnly && (
                <div className="shrink-0 p-3 border-t border-[var(--stage-edge-subtle)]">
                  <button
                    type="button"
                    onClick={onAddCustomLineItem}
                    className="w-full stage-btn stage-btn-ghost inline-flex items-center justify-center gap-2 border border-dashed border-[oklch(1_0_0_/_0.15)] hover:border-[oklch(1_0_0_/_0.25)]"
                  >
                    <Plus className="w-4 h-4" strokeWidth={1.5} aria-hidden />
                    Create custom line item
                  </button>
                </div>
              )}
            </div>
          ) : (
            /* Inspector tab body */
            <div className="flex-1 min-h-0 overflow-y-auto p-3">
              {inspectorContent ?? (
                <div className="py-12 text-center text-sm text-[var(--stage-text-secondary)]">
                  Select a line item to see its details.
                </div>
              )}
            </div>
          )}
        </>
      ) : (
        /* Collapsed rail — single expand button */
        <div className="flex flex-col items-center pt-3">
          <button
            type="button"
            onClick={() => onOpenChange(true)}
            aria-label="Expand catalog panel"
            className="p-2 rounded text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <ChevronsRight className="w-4 h-4" strokeWidth={1.5} aria-hidden />
          </button>
        </div>
      )}
    </motion.aside>
  );
}

function TabButton({
  active,
  disabled,
  onClick,
  children,
  title,
}: {
  active: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  title?: string;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      disabled={disabled}
      onClick={onClick}
      title={title}
      className={cn(
        'px-3 py-1.5 text-sm rounded-[var(--stage-radius-button)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        active
          ? 'bg-[var(--stage-surface-raised)] text-[var(--stage-text-primary)] font-medium'
          : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)]',
        disabled && 'opacity-35 pointer-events-none',
      )}
    >
      {children}
    </button>
  );
}

function formatCategory(cat: string): string {
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
