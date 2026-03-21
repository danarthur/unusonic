/**
 * PackageSelectorPalette — Omni-Selector: floating glass popover for Add from Catalog.
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
import { SIGNAL_PHYSICS } from '@/shared/lib/motion-constants';
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
    if (open && workspaceId) loadPackages();
  }, [open, workspaceId, loadPackages]);

  useEffect(() => {
    if (!open) {
      setSelected(null);
      setPreview(null);
      setSearch('');
      setApplyError(null);
    }
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
        className={cn(
          'w-[min(420px,calc(100vw-32px))] max-h-[min(85vh,560px)] flex flex-col p-0 overflow-hidden',
          'border border-white/10 backdrop-blur-xl shadow-[0_16px_48px_-12px_oklch(0_0_0/0.4)]',
          'bg-[var(--glass-bg)]',
          className
        )}
      >
        <div className="shrink-0 p-4 border-b border-white/10">
          <h3 className="text-sm font-semibold uppercase tracking-widest text-ink-muted mb-3">
            Add from catalog
          </h3>
          <div className="relative">
            <Search
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-muted pointer-events-none"
              aria-hidden
            />
            <input
              type="search"
              placeholder="Search packages…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-white/10 bg-obsidian/60 text-ceramic placeholder:text-ink-muted text-sm focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
              aria-label="Search packages"
            />
          </div>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-ink-muted text-sm">
              <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
              Loading…
            </div>
          ) : error ? (
            <p className="p-4 text-sm text-[var(--color-signal-error)]">{error}</p>
          ) : !selected ? (
            <ul className="p-2 space-y-1">
              {filteredPackages.length === 0 ? (
                <li className="py-8 text-center text-sm text-ink-muted">
                  {packages.length === 0
                    ? 'No packages yet. Add master packages in Catalog.'
                    : 'No packages match your search.'}
                </li>
              ) : (
                filteredPackages.map((pkg) => (
                  <motion.li
                    key={pkg.id}
                    layout
                    transition={SIGNAL_PHYSICS}
                    className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 hover:border-white/20 hover:bg-white/[0.06] transition-colors cursor-pointer"
                    onClick={() => handleSelectPackage(pkg)}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-ceramic truncate text-sm">{pkg.name}</p>
                      {pkg.description && (
                        <p className="text-xs text-ink-muted truncate mt-0.5">{pkg.description}</p>
                      )}
                      <p className="text-sm font-semibold text-ceramic mt-1">
                        ${Number(pkg.price).toLocaleString()}
                      </p>
                    </div>
                    <Plus className="w-4 h-4 text-ink-muted shrink-0" aria-hidden />
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
                transition={SIGNAL_PHYSICS}
                className="p-4 space-y-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(null);
                      setPreview(null);
                    }}
                    className="text-xs font-medium text-ink-muted hover:text-ceramic transition-colors"
                  >
                    ← Back to list
                  </button>
                </div>
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <p className="font-medium text-ceramic text-sm">{selected.name}</p>
                  <p className="text-sm font-semibold text-ceramic mt-1">
                    ${Number(selected.price).toLocaleString()}
                  </p>
                  {previewLoading ? (
                    <div className="flex items-center gap-2 mt-3 text-ink-muted text-xs">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading preview…
                    </div>
                  ) : previewSummary ? (
                    <p className="mt-3 text-xs text-ink-muted leading-relaxed">
                      Includes: {previewSummary}
                    </p>
                  ) : (
                    <p className="mt-3 text-xs text-ink-muted">Single item</p>
                  )}
                </div>
                {applyError && (
                  <p className="text-sm text-[var(--color-signal-error)]" role="alert">
                    {applyError}
                  </p>
                )}
                <button
                  type="button"
                  onClick={handleApply}
                  disabled={applying}
                  className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-[var(--color-neon-amber)]/50 bg-[var(--color-neon-amber)]/10 text-[var(--color-neon-amber)] font-medium text-sm hover:bg-[var(--color-neon-amber)]/20 disabled:opacity-50 disabled:pointer-events-none transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
                >
                  {applying ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" aria-hidden />
                      Applying…
                    </>
                  ) : (
                    <>
                      <Check className="w-4 h-4" aria-hidden />
                      Apply to proposal
                    </>
                  )}
                </button>
              </motion.div>
            </AnimatePresence>
          )}
        </div>

        <div className="shrink-0 p-3 border-t border-white/10">
          <button
            type="button"
            onClick={handleCustomLine}
            className="w-full inline-flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed border-white/20 text-ink-muted hover:text-ceramic hover:border-white/30 hover:bg-white/[0.04] text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--ring)]"
          >
            <Plus className="w-4 h-4" aria-hidden />
            Create custom line item
          </button>
        </div>
      </PopoverContent>
    </Popover>
  );
}
