/**
 * Archived items view — dedicated section for browsing and bulk-restoring archived catalog items.
 * Replaces the "show archived" toggle mixing with a clean, separate rendering mode.
 */

'use client';

import { useState, useCallback, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArchiveRestore, Trash2, Archive, AlertTriangle, Check } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT, STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogClose,
} from '@/shared/ui/dialog';
import {
  checkCanDeletePackages,
  permanentlyDeletePackages,
  type DeleteCheckResult,
} from '@/features/sales/api/catalog-delete';
import type { PackageWithTags } from '@/features/sales/api/package-actions';

/* ─── Helpers ─── */

const CATEGORY_LABELS: Record<string, string> = {
  package: 'Package',
  service: 'Service',
  rental: 'Rental',
  talent: 'Talent',
  retail_sale: 'Retail',
  fee: 'Fee',
};

function formatDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '\u2014';
  try {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    }).format(new Date(dateStr));
  } catch {
    return '\u2014';
  }
}

/* ─── Props ─── */

export interface ArchivedItemsViewProps {
  packages: PackageWithTags[];
  onRestore: (ids: string[]) => void | Promise<void>;
  onDelete?: (ids: string[]) => void | Promise<void>;
  onBack: () => void;
}

/* ─── Component ─── */

export function ArchivedItemsView({ packages, onRestore, onDelete, onBack }: ArchivedItemsViewProps) {
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [restoring, setRestoring] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteChecks, setDeleteChecks] = useState<Record<string, DeleteCheckResult> | null>(null);
  const [deleteChecking, setDeleteChecking] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteResult, setDeleteResult] = useState<{ deleted: number; unlinkedProposalItems: number } | null>(null);
  const lastClickedIndex = useRef<number | null>(null);

  const archivedItems = useMemo(
    () => packages.filter((p) => p.is_active === false),
    [packages]
  );

  const allSelected = archivedItems.length > 0 && archivedItems.every((p) => selectedIds.has(p.id));
  const someSelected = archivedItems.some((p) => selectedIds.has(p.id)) && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(archivedItems.map((p) => p.id)));
    }
  }, [allSelected, archivedItems]);

  const toggleRow = useCallback(
    (index: number, shiftKey: boolean) => {
      const pkg = archivedItems[index];
      if (!pkg) return;
      const next = new Set(selectedIds);

      if (shiftKey && lastClickedIndex.current !== null) {
        const start = Math.min(lastClickedIndex.current, index);
        const end = Math.max(lastClickedIndex.current, index);
        for (let i = start; i <= end; i++) {
          next.add(archivedItems[i].id);
        }
      } else {
        if (next.has(pkg.id)) {
          next.delete(pkg.id);
        } else {
          next.add(pkg.id);
        }
      }

      lastClickedIndex.current = index;
      setSelectedIds(next);
    },
    [archivedItems, selectedIds]
  );

  const handleRestore = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setRestoring(true);
    try {
      await onRestore(Array.from(selectedIds));
      setSelectedIds(new Set());
    } finally {
      setRestoring(false);
    }
  }, [selectedIds, onRestore]);

  const handleOpenDeleteDialog = useCallback(async () => {
    if (selectedIds.size === 0) return;
    setDeleteChecking(true);
    setDeleteChecks(null);
    setDeleteResult(null);
    setDeleteDialogOpen(true);
    try {
      const checks = await checkCanDeletePackages(Array.from(selectedIds));
      setDeleteChecks(checks);
    } catch {
      setDeleteChecks({});
    } finally {
      setDeleteChecking(false);
    }
  }, [selectedIds]);

  const handleConfirmDelete = useCallback(async () => {
    if (!deleteChecks) return;
    const allIds = Object.keys(deleteChecks);
    if (allIds.length === 0) return;
    setDeleting(true);
    try {
      const result = await permanentlyDeletePackages(allIds);
      setDeleteResult({ deleted: result.deleted, unlinkedProposalItems: result.unlinkedProposalItems });
      setSelectedIds(new Set());
      if (onDelete) await onDelete(allIds);
    } catch {
      setDeleteResult({ deleted: 0, unlinkedProposalItems: 0 });
    } finally {
      setDeleting(false);
    }
  }, [deleteChecks, onDelete]);

  const totalProposalRefs = deleteChecks
    ? Object.values(deleteChecks).reduce((sum, c) => sum + c.proposalCount, 0)
    : 0;
  const itemsWithRefs = deleteChecks
    ? Object.values(deleteChecks).filter((c) => c.proposalCount > 0).length
    : 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={STAGE_MEDIUM}
      className="flex flex-col gap-6"
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <button
            type="button"
            onClick={onBack}
            className="inline-flex items-center gap-2 px-3 py-2 rounded-[var(--stage-radius-nested)] text-sm font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
          >
            <ArrowLeft size={16} strokeWidth={1.5} />
            Back to catalog
          </button>
          <div className="w-px h-5 bg-[oklch(1_0_0_/_0.10)]" />
          <div className="flex items-center gap-2">
            <Archive size={18} strokeWidth={1.5} className="text-[var(--stage-text-secondary)]" />
            <h2 className="text-lg font-medium text-[var(--stage-text-primary)] tracking-tight">
              Archived items
            </h2>
            <span className="px-2 py-0.5 rounded-full bg-[oklch(1_0_0_/_0.08)] text-xs font-medium text-[var(--stage-text-secondary)] tabular-nums">
              {archivedItems.length}
            </span>
          </div>
        </div>

        {/* Permanently delete */}
        <button
          type="button"
          onClick={handleOpenDeleteDialog}
          disabled={selectedIds.size === 0}
          className={cn(
            'inline-flex items-center gap-1.5 px-3 py-2 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
            selectedIds.size > 0
              ? 'text-[oklch(0.65_0.2_25)] hover:bg-[oklch(0.65_0.2_25_/_0.1)] cursor-pointer'
              : 'text-[var(--stage-text-secondary)] opacity-50 cursor-default'
          )}
        >
          <Trash2 size={14} strokeWidth={1.5} />
          Permanently delete
        </button>
      </div>

      {/* Floating action bar */}
      <AnimatePresence>
        {selectedIds.size > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            transition={STAGE_MEDIUM}
            className="stage-panel bg-[var(--stage-surface-elevated)] rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.12)] px-4 py-2.5 flex items-center gap-3"
          >
            <span className="text-sm font-medium text-[var(--stage-text-primary)] tabular-nums whitespace-nowrap">
              {selectedIds.size} selected
            </span>
            <div className="w-px h-5 bg-[oklch(1_0_0_/_0.10)]" />
            <button
              type="button"
              onClick={handleRestore}
              disabled={restoring}
              className={cn(
                'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[var(--stage-radius-nested)] text-xs font-medium transition-colors',
                'text-[var(--color-unusonic-success)] hover:bg-[oklch(1_0_0_/_0.05)]',
                'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                'disabled:opacity-45'
              )}
            >
              <ArchiveRestore size={14} strokeWidth={1.5} />
              Restore {selectedIds.size} {selectedIds.size === 1 ? 'item' : 'items'}
            </button>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => setSelectedIds(new Set())}
              className="text-xs font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] transition-colors"
            >
              Clear
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Table or empty state */}
      {archivedItems.length === 0 ? (
        <div className="stage-panel rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] p-16 text-center">
          <Archive size={32} strokeWidth={1} className="mx-auto mb-3 text-[var(--stage-text-secondary)] opacity-40" />
          <p className="text-sm text-[var(--stage-text-secondary)]">No archived items</p>
          <p className="text-xs text-[var(--stage-text-secondary)] mt-1 opacity-70">
            Items you archive from the catalog will appear here.
          </p>
        </div>
      ) : (
        <div className="stage-panel rounded-[var(--stage-radius-panel)] border border-[oklch(1_0_0_/_0.08)] overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-[oklch(1_0_0_/_0.08)] bg-[var(--ctx-well)]">
                  <th className="px-4 py-3 w-10">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      ref={(el) => {
                        if (el) el.indeterminate = someSelected;
                      }}
                      onChange={toggleAll}
                      className="accent-[var(--stage-accent)] size-4 cursor-pointer"
                      aria-label="Select all archived items"
                    />
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                    Name
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                    Category
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] tabular-nums">
                    Original price
                  </th>
                  <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                    Archived
                  </th>
                </tr>
              </thead>
              <tbody>
                {archivedItems.map((pkg, idx) => {
                  const selected = selectedIds.has(pkg.id);
                  return (
                    <motion.tr
                      key={pkg.id}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={STAGE_LIGHT}
                      className={cn(
                        'border-b border-[oklch(1_0_0_/_0.08)] last:border-b-0 stage-hover overflow-hidden transition-colors',
                        selected && 'bg-[oklch(1_0_0_/_0.04)]'
                      )}
                    >
                      <td className="px-4 py-3 w-10">
                        <input
                          type="checkbox"
                          checked={selected}
                          onChange={() => {}}
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleRow(idx, e.shiftKey);
                          }}
                          className="accent-[var(--stage-accent)] size-4 cursor-pointer"
                          aria-label={`Select ${pkg.name}`}
                        />
                      </td>
                      <td className="px-4 py-3">
                        <span className="font-medium text-[var(--stage-text-primary)] opacity-80 truncate block max-w-[300px]" title={pkg.name}>
                          {pkg.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--stage-text-secondary)]">
                        {CATEGORY_LABELS[pkg.category] ?? pkg.category}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--stage-text-secondary)]">
                        ${Number(pkg.price).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--stage-text-secondary)]">
                        {formatDate(pkg.updated_at)}
                      </td>
                    </motion.tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={(open) => {
        if (!open) {
          setDeleteDialogOpen(false);
          setDeleteChecks(null);
          setDeleteResult(null);
        }
      }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {deleteResult ? 'Deletion complete' : `Permanently delete ${selectedIds.size} ${selectedIds.size === 1 ? 'item' : 'items'}?`}
            </DialogTitle>
            <DialogClose />
          </DialogHeader>
          <div className="px-6 pb-6 flex flex-col gap-4">
            {deleteResult ? (
              /* ─── Result state ─── */
              <div className="flex flex-col gap-3">
                <p className="text-sm text-[var(--stage-text-primary)]">
                  Deleted {deleteResult.deleted} {deleteResult.deleted === 1 ? 'item' : 'items'}.
                </p>
                {deleteResult.unlinkedProposalItems > 0 && (
                  <p className="text-sm text-[var(--stage-text-secondary)]">
                    {deleteResult.unlinkedProposalItems} proposal line {deleteResult.unlinkedProposalItems === 1 ? 'item was' : 'items were'} unlinked. Proposal data is preserved.
                  </p>
                )}
                <button
                  type="button"
                  onClick={() => { setDeleteDialogOpen(false); setDeleteChecks(null); setDeleteResult(null); }}
                  className="stage-hover overflow-hidden w-full py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.12)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                >
                  Done
                </button>
              </div>
            ) : deleteChecking ? (
              /* ─── Loading state ─── */
              <p className="text-sm text-[var(--stage-text-secondary)] py-4 text-center">Checking references...</p>
            ) : deleteChecks ? (
              /* ─── Check results ─── */
              <>
                <p className="text-sm text-[var(--stage-text-secondary)]">
                  This cannot be undone. Existing proposals keep their data — only the catalog link is removed.
                </p>

                {/* Items to delete */}
                <div className="flex flex-col gap-1.5">
                  {Object.entries(deleteChecks).map(([id, c]) => (
                    <div
                      key={id}
                      className="flex items-center gap-2 px-3 py-2 rounded-[var(--stage-radius-nested)] bg-[var(--ctx-well)]"
                    >
                      <Trash2 size={14} strokeWidth={1.5} className="shrink-0 text-[oklch(0.65_0.2_25)]" />
                      <div className="flex flex-col min-w-0 flex-1">
                        <span className="text-sm text-[var(--stage-text-primary)] truncate">{c.packageName}</span>
                        {c.proposalCount > 0 && (
                          <span className="text-xs text-[var(--stage-text-secondary)]">
                            Will unlink from {c.proposalCount} proposal {c.proposalCount === 1 ? 'item' : 'items'}
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Summary warning for items with proposal references */}
                {totalProposalRefs > 0 && (
                  <div className="flex items-start gap-2 px-3 py-2.5 rounded-[var(--stage-radius-nested)] bg-[var(--stage-surface)] border-l-[3px] border-l-[var(--color-unusonic-warning)]">
                    <AlertTriangle size={14} strokeWidth={1.5} className="shrink-0 mt-0.5 text-[var(--color-unusonic-warning)]" />
                    <p className="text-xs text-[var(--color-unusonic-warning)]">
                      {itemsWithRefs} {itemsWithRefs === 1 ? 'item is' : 'items are'} referenced by proposals.
                      Those proposals will keep their line item data (name, price, snapshot) but lose the link back to the catalog.
                    </p>
                  </div>
                )}

                {/* Action buttons */}
                <div className="flex items-center gap-3 pt-2">
                  <button
                    type="button"
                    onClick={() => { setDeleteDialogOpen(false); setDeleteChecks(null); }}
                    className="stage-hover overflow-hidden flex-1 py-2.5 rounded-[var(--stage-radius-button)] border border-[oklch(1_0_0_/_0.12)] bg-[var(--stage-surface)] text-[var(--stage-text-primary)] font-medium text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleConfirmDelete}
                    disabled={deleting}
                    className={cn(
                      'flex-1 py-2.5 rounded-[var(--stage-radius-button)] border font-medium text-sm transition-colors',
                      'focus:outline-none focus-visible:ring-2 focus-visible:ring-[oklch(0.65_0.2_25)]',
                      'border-[oklch(0.65_0.2_25_/_0.3)] bg-[oklch(0.65_0.2_25_/_0.12)] text-[oklch(0.65_0.2_25)]',
                      'hover:bg-[oklch(0.65_0.2_25_/_0.2)]',
                      'disabled:opacity-45'
                    )}
                  >
                    {deleting
                      ? 'Deleting...'
                      : `Delete ${Object.keys(deleteChecks).length} ${Object.keys(deleteChecks).length === 1 ? 'item' : 'items'}`}
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
