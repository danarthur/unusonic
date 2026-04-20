'use client';

/**
 * ProposalCatalogPanel — collapsible left panel with a Catalog / Inspector
 * tab switcher, styled after AionSidebar (flat surface, right border, tight
 * typography, AnimatePresence-based open/close). When closed, the parent
 * renders a floating `PanelLeft` button to reopen it — identical pattern to
 * the Aion tab.
 *
 * The Catalog tab lets the discoverer browse the full package library with
 * search, category groupings, and a list/card view toggle. Click-to-add
 * (no drag, per research). The Inspector tab hosts `ProposalLineInspector`
 * when a line item is selected on the receipt.
 *
 * Width: 320px open (richer content than Aion's 260). Mobile: backdrop +
 * fixed overlay (`lg:relative`) matching AionSidebar's responsive behavior.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import {
  LayoutGrid,
  List,
  Loader2,
  PanelLeftClose,
  Plus,
  Search,
} from 'lucide-react';
import {
  getPackages,
  addPackageToProposal,
} from '../api/proposal-actions';
import {
  checkBatchAvailability,
  type ItemAvailability,
} from '../api/catalog-availability';
import type { Package } from '@/types/supabase';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

export type ProposalCatalogPanelTab = 'catalog' | 'inspector';
export type ProposalCatalogViewMode = 'list' | 'card';

export interface ProposalCatalogPanelProps {
  workspaceId: string;
  dealId: string;
  proposedDate?: string | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  activeTab: ProposalCatalogPanelTab;
  onActiveTabChange: (tab: ProposalCatalogPanelTab) => void;
  inspectorContent: React.ReactNode | null;
  inspectorAvailable: boolean;
  onProposalRefetch?: () => void;
  onItemAdded?: (packageId?: string) => void;
  onAddCustomLineItem?: () => void;
  readOnly?: boolean;
}

const PANEL_WIDTH = 320;

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
  const [viewMode, setViewMode] = useState<ProposalCatalogViewMode>('list');

  useEffect(() => {
    if (!workspaceId || !open) return;
    let cancelled = false;
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
    <AnimatePresence initial={false}>
      {open && (
        <>
          {/* Mobile backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.12 }}
            className="fixed inset-0 z-40 bg-[oklch(0.06_0_0/0.75)] lg:hidden"
            onClick={() => onOpenChange(false)}
          />
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: PANEL_WIDTH, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="shrink-0 overflow-hidden h-full fixed lg:relative z-50 lg:z-auto"
            data-surface="surface"
          >
            <div
              className="flex flex-col h-full bg-[var(--stage-surface)] border-r border-[var(--stage-edge-subtle)]"
              style={{ width: PANEL_WIDTH }}
            >
              {/* Header: tab switcher + collapse button. Small typography
                  matching the Aion sidebar. */}
              <div className="flex items-center justify-between gap-2 px-3 py-2.5 shrink-0 border-b border-[var(--stage-edge-subtle)]">
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
                  aria-label="Close panel"
                  className="p-1.5 rounded-[6px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors duration-[80ms]"
                >
                  <PanelLeftClose size={15} strokeWidth={1.5} />
                </button>
              </div>

              {activeTab === 'catalog' ? (
                <>
                  {/* Search + view toggle row */}
                  <div className="flex items-center gap-2 px-3 pt-2.5 pb-2 shrink-0">
                    <div className="relative flex-1">
                      <Search
                        size={13}
                        strokeWidth={1.5}
                        className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--stage-text-tertiary)] pointer-events-none"
                      />
                      <input
                        type="text"
                        value={search}
                        onChange={(e) => setSearch(e.target.value)}
                        placeholder="Search catalog"
                        className="w-full bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.06)] rounded-md pl-7 pr-2.5 py-1.5 text-xs text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] outline-none focus-visible:border-[var(--stage-accent)] transition-colors duration-[80ms]"
                        aria-label="Search catalog"
                      />
                    </div>
                    {/* View mode toggle — list vs card */}
                    <div
                      role="group"
                      aria-label="Catalog view"
                      className="flex items-center gap-0.5 p-0.5 rounded-md bg-[var(--ctx-well)] border border-[oklch(1_0_0_/_0.06)]"
                    >
                      <ViewToggleButton
                        active={viewMode === 'list'}
                        onClick={() => setViewMode('list')}
                        icon={<List size={12} strokeWidth={1.5} />}
                        label="List view"
                      />
                      <ViewToggleButton
                        active={viewMode === 'card'}
                        onClick={() => setViewMode('card')}
                        icon={<LayoutGrid size={12} strokeWidth={1.5} />}
                        label="Card view"
                      />
                    </div>
                  </div>

                  {/* Catalog body */}
                  <div className="flex-1 overflow-y-auto scrollbar-hide px-2 pb-2">
                    {loading ? (
                      <div className="flex items-center justify-center gap-2 py-12 text-[var(--stage-text-tertiary)] text-xs">
                        <Loader2 size={13} strokeWidth={1.5} className="animate-spin" aria-hidden />
                        Loading catalog…
                      </div>
                    ) : grouped.length === 0 ? (
                      <p className="px-2 py-8 text-center text-xs text-[var(--stage-text-tertiary)] select-none">
                        {packages.length === 0
                          ? 'No packages yet. Add master packages in Catalog.'
                          : 'No packages match your search.'}
                      </p>
                    ) : (
                      grouped.map(([category, items]) => (
                        <div key={category} className="mb-3">
                          <p className="px-2 pt-3 pb-1.5 stage-label font-mono text-[var(--stage-text-tertiary)] select-none">
                            {formatCategory(category)}
                          </p>
                          {viewMode === 'list' ? (
                            items.map((pkg) => (
                              <CatalogListItem
                                key={pkg.id}
                                pkg={pkg}
                                avail={pkg.category === 'rental' ? availability[pkg.id] : undefined}
                                applying={applyingId === pkg.id}
                                disabled={readOnly}
                                onAdd={() => handleAdd(pkg)}
                              />
                            ))
                          ) : (
                            <div className="grid grid-cols-2 gap-1.5 px-1">
                              {items.map((pkg) => (
                                <CatalogCardItem
                                  key={pkg.id}
                                  pkg={pkg}
                                  avail={pkg.category === 'rental' ? availability[pkg.id] : undefined}
                                  applying={applyingId === pkg.id}
                                  disabled={readOnly}
                                  onAdd={() => handleAdd(pkg)}
                                />
                              ))}
                            </div>
                          )}
                        </div>
                      ))
                    )}
                  </div>

                  {onAddCustomLineItem && !readOnly && (
                    <div className="shrink-0 p-2 border-t border-[var(--stage-edge-subtle)]">
                      <button
                        type="button"
                        onClick={onAddCustomLineItem}
                        className="w-full inline-flex items-center justify-center gap-1.5 py-1.5 text-xs rounded-md border border-dashed border-[oklch(1_0_0_/_0.12)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.22)] transition-colors"
                      >
                        <Plus size={12} strokeWidth={1.5} aria-hidden />
                        Create custom line item
                      </button>
                    </div>
                  )}
                </>
              ) : (
                /* Inspector tab body */
                <div className="flex-1 overflow-y-auto scrollbar-hide">
                  {inspectorContent ?? (
                    <p className="px-3 py-8 text-center text-xs text-[var(--stage-text-tertiary)] select-none">
                      Select a line item to see its details.
                    </p>
                  )}
                </div>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}

// ---------------------------------------------------------------------------

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
        'px-2.5 py-1 text-xs rounded-[6px] transition-colors duration-[80ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        active
          ? 'bg-[oklch(1_0_0_/_0.06)] text-[var(--stage-text-primary)] font-medium'
          : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.04)]',
        disabled && 'opacity-35 pointer-events-none',
      )}
    >
      {children}
    </button>
  );
}

function ViewToggleButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'p-1 rounded transition-colors duration-[80ms] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
        active
          ? 'bg-[var(--stage-surface-raised)] text-[var(--stage-text-primary)]'
          : 'text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-secondary)]',
      )}
    >
      {icon}
    </button>
  );
}

function AvailabilityDot({ avail }: { avail: ItemAvailability }) {
  const title =
    avail.status === 'available'
      ? `${avail.available} available`
      : avail.status === 'tight'
        ? `${avail.available} of ${avail.stockQuantity} remaining`
        : 'Fully booked';
  return (
    <span
      className={cn(
        'inline-block w-1.5 h-1.5 rounded-full shrink-0',
        avail.status === 'available'
          ? 'bg-[var(--color-unusonic-success)]'
          : avail.status === 'tight'
            ? 'bg-[var(--color-unusonic-warning)]'
            : 'bg-[var(--color-unusonic-error)]',
      )}
      aria-hidden
      title={title}
    />
  );
}

// ---------------------------------------------------------------------------
// List row (compact)

function CatalogListItem({
  pkg,
  avail,
  applying,
  disabled,
  onAdd,
}: {
  pkg: Package;
  avail: ItemAvailability | undefined;
  applying: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled || applying}
      className={cn(
        'group/item relative w-full text-left px-2.5 py-2 rounded-lg transition-colors duration-[80ms]',
        'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.04)] hover:text-[var(--stage-text-primary)]',
        'disabled:opacity-45 disabled:pointer-events-none',
      )}
    >
      <div className="flex items-center gap-1.5">
        <p className="text-sm truncate leading-snug flex-1">{pkg.name}</p>
        {avail && <AvailabilityDot avail={avail} />}
      </div>
      <div className="flex items-center justify-between gap-2 mt-0.5">
        <p className="text-label text-[var(--stage-text-tertiary)] tabular-nums">
          ${Number(pkg.price).toLocaleString()}
        </p>
        {applying ? (
          <Loader2
            size={11}
            strokeWidth={1.5}
            className="animate-spin text-[var(--stage-text-tertiary)]"
            aria-hidden
          />
        ) : (
          <Plus
            size={12}
            strokeWidth={1.5}
            className="text-[var(--stage-text-tertiary)] opacity-0 group-hover/item:opacity-100 transition-opacity"
            aria-hidden
          />
        )}
      </div>
    </button>
  );
}

// ---------------------------------------------------------------------------
// Card (richer)

function CatalogCardItem({
  pkg,
  avail,
  applying,
  disabled,
  onAdd,
}: {
  pkg: Package;
  avail: ItemAvailability | undefined;
  applying: boolean;
  disabled: boolean;
  onAdd: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onAdd}
      disabled={disabled || applying}
      className={cn(
        'group/card text-left rounded-lg border border-[oklch(1_0_0_/_0.06)] bg-[var(--stage-surface-raised)] p-2 transition-colors duration-[80ms]',
        'hover:border-[oklch(1_0_0_/_0.14)] hover:bg-[oklch(1_0_0_/_0.04)]',
        'disabled:opacity-45 disabled:pointer-events-none',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
      )}
    >
      <div className="flex items-start justify-between gap-1 mb-1.5">
        <p className="text-xs font-medium text-[var(--stage-text-primary)] line-clamp-2 leading-snug">
          {pkg.name}
        </p>
        {avail && <AvailabilityDot avail={avail} />}
      </div>
      {pkg.description && (
        <p className="text-label text-[var(--stage-text-tertiary)] line-clamp-2 mb-1.5 leading-snug">
          {pkg.description}
        </p>
      )}
      <div className="flex items-center justify-between gap-1">
        <p className="text-xs text-[var(--stage-text-secondary)] tabular-nums font-medium">
          ${Number(pkg.price).toLocaleString()}
        </p>
        {applying ? (
          <Loader2
            size={11}
            strokeWidth={1.5}
            className="animate-spin text-[var(--stage-text-tertiary)]"
            aria-hidden
          />
        ) : (
          <Plus
            size={12}
            strokeWidth={1.5}
            className="text-[var(--stage-text-tertiary)] group-hover/card:text-[var(--stage-text-primary)] transition-colors"
            aria-hidden
          />
        )}
      </div>
    </button>
  );
}

function formatCategory(cat: string): string {
  return cat
    .split('_')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
