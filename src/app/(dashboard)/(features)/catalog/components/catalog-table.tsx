'use client';

import { useCallback, useRef, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { Archive, ArchiveRestore, ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { PackageWithTags } from '@/features/sales/api/package-actions';

/* ─── Types ─── */

type SortColumn = 'name' | 'category' | 'price' | 'cost' | 'margin' | 'stock' | 'status';
type SortDirection = 'asc' | 'desc';

interface SortState {
  column: SortColumn;
  direction: SortDirection;
}

export interface CatalogTableProps {
  packages: PackageWithTags[];
  selectedIds: Set<string>;
  onSelectionChange: (ids: Set<string>) => void;
  onArchive: (pkg: PackageWithTags) => void;
  /** ID of the keyboard-focused package. */
  focusedPackageId?: string | null;
  /** Semantic search results to show below main results. */
  semanticResults?: PackageWithTags[];
  /** Whether semantic search is currently loading. */
  semanticLoading?: boolean;
}

/* ─── Helpers ─── */

const CATEGORY_LABELS: Record<string, string> = {
  package: 'Package',
  service: 'Service',
  rental: 'Rental',
  talent: 'Talent',
  retail_sale: 'Retail',
  fee: 'Fee',
};

function getMargin(pkg: PackageWithTags): number | null {
  const price = Number(pkg.price);
  const cost = pkg.target_cost != null ? Number(pkg.target_cost) : null;
  if (cost === null || price === 0) return null;
  return ((price - cost) / price) * 100;
}

function getStatus(pkg: PackageWithTags): 'active' | 'draft' | 'archived' {
  if (!pkg.is_active) return 'archived';
  if (pkg.is_draft) return 'draft';
  return 'active';
}

function getStockDisplay(pkg: PackageWithTags): { value: number | null; color: string } {
  if (pkg.category !== 'rental' && pkg.category !== 'retail_sale') {
    return { value: null, color: '' };
  }
  const qty = pkg.stock_quantity ?? 0;
  let color = 'bg-[var(--color-unusonic-success)]';
  if (qty === 0) color = 'bg-[var(--color-unusonic-error)]';
  else if (qty <= 3) color = 'bg-[var(--color-unusonic-warning)]';
  return { value: qty, color };
}

function comparePkgs(a: PackageWithTags, b: PackageWithTags, sort: SortState): number {
  const dir = sort.direction === 'asc' ? 1 : -1;
  switch (sort.column) {
    case 'name':
      return dir * a.name.localeCompare(b.name);
    case 'category':
      return dir * (a.category ?? '').localeCompare(b.category ?? '');
    case 'price':
      return dir * (Number(a.price) - Number(b.price));
    case 'cost':
      return dir * ((a.target_cost ?? 0) - (b.target_cost ?? 0));
    case 'margin': {
      const ma = getMargin(a) ?? -Infinity;
      const mb = getMargin(b) ?? -Infinity;
      return dir * (ma - mb);
    }
    case 'stock': {
      const sa = getStockDisplay(a).value ?? -1;
      const sb = getStockDisplay(b).value ?? -1;
      return dir * (sa - sb);
    }
    case 'status': {
      const order = { active: 0, draft: 1, archived: 2 };
      return dir * (order[getStatus(a)] - order[getStatus(b)]);
    }
    default:
      return 0;
  }
}

/* ─── Column header ─── */

function SortHeader({
  label,
  column,
  sort,
  onSort,
  numeric,
  className,
}: {
  label: string;
  column: SortColumn;
  sort: SortState;
  onSort: (col: SortColumn) => void;
  numeric?: boolean;
  className?: string;
}) {
  const active = sort.column === column;
  return (
    <th
      className={cn(
        'px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] select-none cursor-pointer hover:text-[var(--stage-text-primary)] transition-colors',
        numeric && 'tabular-nums',
        className
      )}
      onClick={() => onSort(column)}
    >
      <span className="inline-flex items-center gap-1">
        {label}
        {active && (
          sort.direction === 'asc'
            ? <ChevronUp size={12} strokeWidth={2} className="text-[var(--stage-text-primary)]" />
            : <ChevronDown size={12} strokeWidth={2} className="text-[var(--stage-text-primary)]" />
        )}
      </span>
    </th>
  );
}

/* ─── Component ─── */

export function CatalogTable({ packages, selectedIds, onSelectionChange, onArchive, focusedPackageId, semanticResults = [], semanticLoading = false }: CatalogTableProps) {
  const router = useRouter();
  const [sort, setSort] = useState<SortState>({ column: 'name', direction: 'asc' });
  const lastClickedIndex = useRef<number | null>(null);

  const sorted = useMemo(() => [...packages].sort((a, b) => comparePkgs(a, b, sort)), [packages, sort]);

  const handleSort = useCallback((col: SortColumn) => {
    setSort((prev) =>
      prev.column === col
        ? { column: col, direction: prev.direction === 'asc' ? 'desc' : 'asc' }
        : { column: col, direction: 'asc' }
    );
  }, []);

  const allSelected = sorted.length > 0 && sorted.every((p) => selectedIds.has(p.id));
  const someSelected = sorted.some((p) => selectedIds.has(p.id)) && !allSelected;

  const toggleAll = useCallback(() => {
    if (allSelected) {
      onSelectionChange(new Set());
    } else {
      onSelectionChange(new Set(sorted.map((p) => p.id)));
    }
  }, [allSelected, sorted, onSelectionChange]);

  const toggleRow = useCallback(
    (index: number, shiftKey: boolean) => {
      const pkg = sorted[index];
      if (!pkg) return;
      const next = new Set(selectedIds);

      if (shiftKey && lastClickedIndex.current !== null) {
        const start = Math.min(lastClickedIndex.current, index);
        const end = Math.max(lastClickedIndex.current, index);
        for (let i = start; i <= end; i++) {
          next.add(sorted[i].id);
        }
      } else {
        if (next.has(pkg.id)) {
          next.delete(pkg.id);
        } else {
          next.add(pkg.id);
        }
      }

      lastClickedIndex.current = index;
      onSelectionChange(next);
    },
    [sorted, selectedIds, onSelectionChange]
  );

  return (
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
                  aria-label="Select all"
                />
              </th>
              <SortHeader label="Name" column="name" sort={sort} onSort={handleSort} />
              <SortHeader label="Category" column="category" sort={sort} onSort={handleSort} />
              <SortHeader label="Price" column="price" sort={sort} onSort={handleSort} numeric />
              <SortHeader label="Cost" column="cost" sort={sort} onSort={handleSort} numeric />
              <SortHeader label="Margin" column="margin" sort={sort} onSort={handleSort} numeric />
              <SortHeader label="Stock" column="stock" sort={sort} onSort={handleSort} numeric />
              <th className="px-4 py-3 text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)]">
                Tags
              </th>
              <SortHeader label="Status" column="status" sort={sort} onSort={handleSort} />
              <th className="px-4 py-3 text-right text-xs font-medium uppercase tracking-wider text-[var(--stage-text-secondary)] w-20">
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={10} className="px-4 py-12 text-center text-sm text-[var(--stage-text-secondary)]">
                  No items match this tab and filter.
                </td>
              </tr>
            ) : (
              sorted.map((pkg, idx) => {
                const href = pkg.category === 'package' ? `/catalog/${pkg.id}/builder` : `/catalog/${pkg.id}/edit`;
                const selected = selectedIds.has(pkg.id);
                const focused = focusedPackageId === pkg.id;
                const status = getStatus(pkg);
                const margin = getMargin(pkg);
                const stock = getStockDisplay(pkg);

                return (
                  <motion.tr
                    key={pkg.id}
                    layout
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={STAGE_LIGHT}
                    onClick={() => router.push(href)}
                    className={cn(
                      'border-b border-[oklch(1_0_0_/_0.08)] last:border-b-0 stage-hover overflow-hidden cursor-pointer',
                      selected && 'bg-[oklch(1_0_0_/_0.04)]',
                      focused && 'ring-1 ring-inset ring-[var(--stage-accent)]/40',
                      status === 'archived' && 'opacity-70'
                    )}
                  >
                    {/* Checkbox */}
                    <td className="px-4 py-3 w-10">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={() => {}} // handled by onClick
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleRow(idx, e.shiftKey);
                        }}
                        className="accent-[var(--stage-accent)] size-4 cursor-pointer"
                        aria-label={`Select ${pkg.name}`}
                      />
                    </td>

                    {/* Name */}
                    <td className="px-4 py-3">
                      <span className="font-medium text-[var(--stage-text-primary)] truncate block max-w-[240px]" title={pkg.name}>
                        {pkg.name}
                      </span>
                    </td>

                    {/* Category */}
                    <td className="px-4 py-3 text-sm text-[var(--stage-text-secondary)]">
                      {CATEGORY_LABELS[pkg.category] ?? pkg.category}
                    </td>

                    {/* Price */}
                    <td className="px-4 py-3 tabular-nums text-[var(--stage-text-primary)]">
                      ${Number(pkg.price).toLocaleString()}
                    </td>

                    {/* Cost */}
                    <td className="px-4 py-3 tabular-nums text-[var(--stage-text-secondary)]">
                      {pkg.target_cost != null ? `$${Number(pkg.target_cost).toLocaleString()}` : '\u2014'}
                    </td>

                    {/* Margin */}
                    <td className="px-4 py-3 tabular-nums text-[var(--stage-text-secondary)]">
                      {margin !== null ? `${margin.toFixed(0)}%` : '\u2014'}
                    </td>

                    {/* Stock */}
                    <td className="px-4 py-3 tabular-nums text-[var(--stage-text-secondary)]">
                      {stock.value !== null ? (
                        <span className="inline-flex items-center gap-1.5">
                          <span className={cn('size-2 rounded-full', stock.color)} />
                          {stock.value}
                        </span>
                      ) : (
                        '\u2014'
                      )}
                    </td>

                    {/* Tags */}
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(pkg.tags ?? []).slice(0, 3).map((t) => (
                          <span
                            key={t.id}
                            className="px-2 py-0.5 rounded-md bg-[oklch(1_0_0_/_0.05)] text-xs text-[var(--stage-text-secondary)]"
                          >
                            {t.label}
                          </span>
                        ))}
                        {(pkg.tags ?? []).length > 3 && (
                          <span className="text-xs text-[var(--stage-text-secondary)]">
                            +{(pkg.tags ?? []).length - 3}
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Status */}
                    <td className="px-4 py-3 text-sm">
                      {status === 'active' && (
                        <span className="text-[var(--color-unusonic-success)]">Active</span>
                      )}
                      {status === 'draft' && (
                        <span className="text-[var(--color-unusonic-warning)]">Draft</span>
                      )}
                      {status === 'archived' && (
                        <span className="text-[var(--stage-text-secondary)]">Archived</span>
                      )}
                    </td>

                    {/* Actions */}
                    <td className="px-4 py-3 text-right">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onArchive(pkg);
                        }}
                        className="p-2 rounded-[var(--stage-radius-nested)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.05)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
                        aria-label={pkg.is_active ? 'Archive' : 'Restore'}
                      >
                        {pkg.is_active ? (
                          <Archive size={16} strokeWidth={1.5} />
                        ) : (
                          <ArchiveRestore size={16} strokeWidth={1.5} />
                        )}
                      </button>
                    </td>
                  </motion.tr>
                );
              })
            )}
            {semanticResults.length > 0 && (
              <>
                <tr>
                  <td colSpan={10} className="px-4 py-2">
                    <div className="flex items-center gap-3">
                      <div className="h-px flex-1 bg-[oklch(1_0_0_/_0.08)]" />
                      <span className="text-xs text-[var(--stage-text-secondary)] uppercase tracking-wider">
                        Related
                      </span>
                      <div className="h-px flex-1 bg-[oklch(1_0_0_/_0.08)]" />
                    </div>
                  </td>
                </tr>
                {semanticResults.map((pkg) => {
                  const href = pkg.category === 'package' ? `/catalog/${pkg.id}/builder` : `/catalog/${pkg.id}/edit`;
                  const status = getStatus(pkg);
                  const margin = getMargin(pkg);
                  const stock = getStockDisplay(pkg);
                  return (
                    <motion.tr
                      key={`semantic-${pkg.id}`}
                      layout
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 0.75 }}
                      transition={STAGE_LIGHT}
                      onClick={() => router.push(href)}
                      className={cn(
                        'border-b border-[oklch(1_0_0_/_0.08)] last:border-b-0 stage-hover overflow-hidden cursor-pointer',
                        status === 'archived' && 'opacity-70'
                      )}
                    >
                      <td className="px-4 py-3 w-10" />
                      <td className="px-4 py-3">
                        <span className="font-medium text-[var(--stage-text-primary)] truncate block max-w-[240px]" title={pkg.name}>
                          {pkg.name}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm text-[var(--stage-text-secondary)]">
                        {CATEGORY_LABELS[pkg.category] ?? pkg.category}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--stage-text-primary)]">
                        ${Number(pkg.price).toLocaleString()}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--stage-text-secondary)]">
                        {pkg.target_cost != null ? `$${Number(pkg.target_cost).toLocaleString()}` : '\u2014'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--stage-text-secondary)]">
                        {margin !== null ? `${margin.toFixed(0)}%` : '\u2014'}
                      </td>
                      <td className="px-4 py-3 tabular-nums text-[var(--stage-text-secondary)]">
                        {stock.value !== null ? (
                          <span className="inline-flex items-center gap-1.5">
                            <span className={cn('size-2 rounded-full', stock.color)} />
                            {stock.value}
                          </span>
                        ) : (
                          '\u2014'
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-1">
                          {(pkg.tags ?? []).slice(0, 3).map((t) => (
                            <span
                              key={t.id}
                              className="px-2 py-0.5 rounded-md bg-[oklch(1_0_0_/_0.05)] text-xs text-[var(--stage-text-secondary)]"
                            >
                              {t.label}
                            </span>
                          ))}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {status === 'active' && <span className="text-[var(--color-unusonic-success)]">Active</span>}
                        {status === 'draft' && <span className="text-[var(--color-unusonic-warning)]">Draft</span>}
                        {status === 'archived' && <span className="text-[var(--stage-text-secondary)]">Archived</span>}
                      </td>
                      <td className="px-4 py-3" />
                    </motion.tr>
                  );
                })}
              </>
            )}
            {semanticLoading && (
              <tr>
                <td colSpan={10} className="px-4 py-2 text-center text-xs text-[var(--stage-text-secondary)]">
                  Searching with Aion...
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
