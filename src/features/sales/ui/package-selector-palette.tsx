/**
 * PackageSelectorPalette — Omni-Selector: floating popover for Add from Catalog.
 * Search + package list; on select shows preview (items inside); "Apply to Proposal" does deep copy.
 * Includes "+ Create Custom Line Item" at bottom.
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
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

export type PackageSelectorPaletteProps = {
  workspaceId: string;
  dealId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** After package applied (deep copy), parent should refetch proposal. */
  onApplied?: () => void;
  /** Add a blank custom line item and close. */
  onAddCustomLineItem?: () => void;
  /** Render trigger (e.g. "+ Add from Catalog" button). */
  trigger: React.ReactNode;
  className?: string;
};

export function PackageSelectorPalette({
  workspaceId,
  dealId,
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
    });
  }, [open]);

  const filteredPackages = search.trim()
    ? packages.filter(
        (p) =>
          p.name.toLowerCase().includes(search.toLowerCase()) ||
          (p.description ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (p.category ?? '').toLowerCase().includes(search.toLowerCase())
      )
    : packages;

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
      onApplied?.();
      onOpenChange(false);
    } else {
      setApplyError(result.error ?? 'Failed to add to proposal.');
    }
  }, [dealId, selected, onApplied, onOpenChange]);

  const handleCustomLine = useCallback(() => {
    onAddCustomLineItem?.();
    onOpenChange(false);
  }, [onAddCustomLineItem, onOpenChange]);

  const previewSummary =
    preview && preview.length > 0
      ? preview.map((i) => `${i.quantity}× ${i.name}`).join(', ')
      : null;

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverAnchor asChild>{trigger}</PopoverAnchor>
      <PopoverContent
        align="center"
        sideOffset={12}
        data-surface="raised"
        className={cn(
          'w-[min(420px,calc(100vw-32px))] max-h-[min(85vh,560px)] flex flex-col p-0 overflow-hidden',
          'border border-[oklch(1_0_0_/_0.08)] shadow-[0_16px_48px_-12px_oklch(0_0_0/0.4)]',
          'bg-[var(--stage-surface-raised)]',
          className
        )}
      >
        <div className="shrink-0 p-4 border-b border-[var(--stage-edge-subtle)]">
          <h3 className="text-sm font-medium uppercase tracking-widest text-[var(--stage-text-secondary)] mb-3">
            Add from catalog
          </h3>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--stage-text-secondary)] pointer-events-none"
              strokeWidth={1.5}
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search packages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--ctx-well)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-secondary)] text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
              aria-label="Search packages"
            />
          </div>
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
            <ul className="p-2 space-y-1">
              {filteredPackages.length === 0 ? (
                <li className="py-8 text-center text-sm text-[var(--stage-text-secondary)]">
                  {packages.length === 0
                    ? 'No packages yet. Add master packages in Catalog.'
                    : 'No packages match your search.'}
                </li>
              ) : (
                filteredPackages.map((pkg) => (
                  <motion.li
                    key={pkg.id}
                    layout
                    transition={STAGE_LIGHT}
                    className="flex items-center gap-3 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-3 hover:border-[oklch(1_0_0_/_0.15)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors duration-[80ms] ease-out cursor-pointer"
                    onClick={() => handleSelectPackage(pkg)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-[var(--stage-text-primary)] truncate text-sm">{pkg.name}</p>
                      {pkg.description && (
                        <p className="text-xs text-[var(--stage-text-secondary)] truncate mt-0.5">{pkg.description}</p>
                      )}
                      <p className="text-sm font-medium text-[var(--stage-text-primary)] tabular-nums mt-1">
                        ${Number(pkg.price).toLocaleString()}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-[var(--stage-text-secondary)] shrink-0" strokeWidth={1.5} aria-hidden />
                  </motion.li>
                ))
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
