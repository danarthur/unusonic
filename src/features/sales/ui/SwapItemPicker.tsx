'use client';

import { useEffect, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { RefreshCw, Search, Loader2 } from 'lucide-react';
import { getPackages } from '../api/proposal-actions';
import type { Package } from '../api/package-actions';
import type { ProposalLineItemCategory } from '../model/types';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';

export interface SwapItemPickerProps {
  workspaceId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  filterCategory?: ProposalLineItemCategory | null;
  /** Returns success/error so caller can surface swap errors inline. */
  onSelect: (packageId: string) => Promise<{ success: boolean; error?: string }>;
  error: string | null;
}

/**
 * Inline catalog picker for swapping a proposal line item.
 * Renders a toggle button; when open, shows a searchable list of catalog packages.
 * Disabled for package headers and bundle children (shown via tooltip-like title attribute).
 */
export function SwapItemPicker({
  workspaceId,
  open,
  onOpenChange,
  filterCategory,
  onSelect,
  error,
}: SwapItemPickerProps) {
  const [packages, setPackages] = useState<Package[]>([]);
  const [loading, setLoading] = useState(false);
  const [selecting, setSelecting] = useState(false);
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (!open || !workspaceId) return;
    queueMicrotask(() => {
      setLoading(true);
      getPackages(workspaceId).then((res) => {
        setPackages(res.packages ?? []);
        setLoading(false);
      });
    });
  }, [open, workspaceId]);

  useEffect(() => {
    if (open) return;
    queueMicrotask(() => setSearch(''));
  }, [open]);

  const filtered = (() => {
    let list = packages;
    if (filterCategory) list = list.filter((p) => p.category === filterCategory);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description ?? '').toLowerCase().includes(q)
      );
    }
    return list;
  })();

  const handleSelect = async (packageId: string) => {
    setSelecting(true);
    await onSelect(packageId);
    setSelecting(false);
  };

  return (
    <div>
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        className="inline-flex items-center gap-2 px-3 py-2 rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:border-[oklch(1_0_0_/_0.15)] text-xs font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)]"
      >
        <RefreshCw className="w-3.5 h-3.5" strokeWidth={1.5} aria-hidden />
        Swap item
      </button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={STAGE_LIGHT}
            className="mt-2 rounded-2xl border border-[oklch(1_0_0_/_0.08)] bg-[var(--stage-surface-raised)] overflow-hidden shadow-[0_8px_24px_-4px_oklch(0_0_0_/_0.4)]"
          >
            <div className="p-3 border-b border-[var(--stage-edge-subtle)]">
              <div className="relative">
                <Search
                  className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-[var(--stage-text-secondary)] pointer-events-none"
                  strokeWidth={1.5}
                  aria-hidden
                />
                <input
                  type="search"
                  placeholder="Search catalog…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-8 pr-3 py-2 rounded-lg border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] placeholder:text-[var(--stage-text-tertiary)] text-xs focus:outline-none focus:ring-1 focus:ring-[var(--stage-accent)]"
                />
              </div>
            </div>
            <div className="max-h-48 overflow-y-auto p-2 space-y-1">
              {loading ? (
                <div className="flex items-center justify-center gap-2 py-6 text-[var(--stage-text-secondary)] text-xs">
                  <Loader2 className="w-3.5 h-3.5 animate-spin" strokeWidth={1.5} aria-hidden />
                  Loading…
                </div>
              ) : filtered.length === 0 ? (
                <p className="py-6 text-center text-xs text-[var(--stage-text-secondary)]">
                  {packages.length === 0 ? 'No catalog items.' : 'No matches.'}
                </p>
              ) : (
                filtered.map((pkg) => (
                  <button
                    key={pkg.id}
                    type="button"
                    disabled={selecting}
                    onClick={() => handleSelect(pkg.id)}
                    className="w-full flex items-center justify-between gap-3 rounded-xl border border-[var(--stage-edge-subtle)] bg-[var(--stage-void)] px-3 py-2.5 hover:border-[oklch(1_0_0_/_0.15)] hover:bg-[var(--stage-surface)] disabled:opacity-60 transition-colors text-left focus:outline-none focus:ring-2 focus:ring-[var(--stage-accent)]"
                  >
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-[var(--stage-text-primary)] truncate">{pkg.name}</p>
                      {pkg.description && (
                        <p className="text-[11px] text-[var(--stage-text-secondary)] truncate mt-0.5">
                          {pkg.description}
                        </p>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-[var(--stage-text-primary)] shrink-0 tabular-nums">
                      ${Number(pkg.price).toLocaleString()}
                    </span>
                  </button>
                ))
              )}
            </div>
            {error && (
              <p className="px-3 pb-3 text-xs text-[var(--color-unusonic-error)]" role="alert">
                {error}
              </p>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
