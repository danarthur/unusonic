'use client';

/**
 * CatalogPicker cluster for the proposal-builder studio.
 *
 * Extracted from proposal-builder-studio.tsx (Phase 0.5 split, 2026-04-28).
 *
 * Owns:
 *   - CatalogPicker — workspace packages, workspace tags, semantic search,
 *     click-to-add. Categories group by enum; tag chips filter orthogonally
 *     (AND logic). Shift-click stages items for batch add.
 *   - CatalogItemRow — individual package row with tag pills.
 *   - CatalogSkeleton — pre-load placeholder.
 *   - CatalogEmpty — no-results / no-catalog states.
 *   - TAG_PILL_STYLES + tagPill() — shared color-token tints (mirrors
 *     smart-tag-input.tsx).
 *   - CATEGORY_ORDER — display order for the accordion.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ChevronDown, Plus, Search } from 'lucide-react';
import { toast } from 'sonner';

import { addPackageToProposal } from '@/features/sales/api/proposal-actions';
import {
  getCatalogPackagesWithTags,
  type PackageWithTags,
} from '@/features/sales/api/package-actions';
import {
  getWorkspaceTags,
  type WorkspaceTag,
} from '@/features/sales/api/workspace-tag-actions';
import { semanticSearchCatalog } from '@/features/sales/api/catalog-embeddings';
import { AionMark } from '@/shared/ui/branding/aion-mark';
import { cn } from '@/shared/lib/utils';

// ---------------------------------------------------------------------------
// Catalog picker — real data: workspace packages, workspace tags, semantic
// search, click-to-add. Packages group by category enum; tag chips filter
// orthogonally (AND logic). Shift-click stages items for batch add.
// ---------------------------------------------------------------------------

/** Color token → OKLCH pill tints for tag chips. Mirrors smart-tag-input.tsx. */
const TAG_PILL_STYLES: Record<string, { bg: string; border: string; dot: string }> = {
  'blue-400':     { bg: 'oklch(0.35 0.08 250 / 0.35)', border: 'oklch(0.55 0.12 250 / 0.5)', dot: 'oklch(0.65 0.15 250)' },
  'emerald-400':  { bg: 'oklch(0.35 0.08 145 / 0.35)', border: 'oklch(0.55 0.12 145 / 0.5)', dot: 'oklch(0.65 0.15 145)' },
  'amber-400':    { bg: 'oklch(0.35 0.08 70  / 0.35)', border: 'oklch(0.55 0.12 70  / 0.5)', dot: 'oklch(0.75 0.15 70)' },
  'rose-400':     { bg: 'oklch(0.35 0.08 350 / 0.35)', border: 'oklch(0.55 0.12 350 / 0.5)', dot: 'oklch(0.65 0.18 350)' },
  'violet-400':   { bg: 'oklch(0.35 0.08 290 / 0.35)', border: 'oklch(0.55 0.12 290 / 0.5)', dot: 'oklch(0.65 0.15 290)' },
  'teal-400':     { bg: 'oklch(0.35 0.08 180 / 0.35)', border: 'oklch(0.55 0.12 180 / 0.5)', dot: 'oklch(0.65 0.12 180)' },
  'orange-400':   { bg: 'oklch(0.35 0.08 45  / 0.35)', border: 'oklch(0.55 0.12 45  / 0.5)', dot: 'oklch(0.7 0.15 45)' },
  'fuchsia-400':  { bg: 'oklch(0.35 0.08 320 / 0.35)', border: 'oklch(0.55 0.12 320 / 0.5)', dot: 'oklch(0.65 0.18 320)' },
  'slate-400':    { bg: 'oklch(0.35 0.02 250 / 0.3)',  border: 'oklch(0.5 0.02 250 / 0.45)', dot: 'oklch(0.6 0.02 250)' },
};

function tagPill(color: string) {
  return TAG_PILL_STYLES[color] ?? TAG_PILL_STYLES['slate-400'];
}

/** Category display order + labels for the accordion. */
const CATEGORY_ORDER: { id: string; label: string }[] = [
  { id: 'package',     label: 'Packages' },
  { id: 'service',     label: 'Services' },
  { id: 'rental',      label: 'Rentals' },
  { id: 'talent',      label: 'Talent' },
  { id: 'retail_sale', label: 'Retail' },
  { id: 'fee',         label: 'Fees' },
];

export function CatalogPicker({
  workspaceId,
  dealId,
  forceDemo,
  insertAfterSortOrder,
  onItemAdded,
  swap,
  onSwapPick,
  onCancelSwap,
}: {
  workspaceId: string | null;
  dealId: string;
  forceDemo: boolean;
  insertAfterSortOrder: number | null;
  onItemAdded: () => void;
  swap: { itemId: string; title: string; sortOrder: number; packageInstanceId: string | null; isHeader: boolean } | null;
  onSwapPick: (newPackageId: string) => Promise<void>;
  onCancelSwap: () => void;
}) {
  const [query, setQuery] = useState('');
  const [packages, setPackages] = useState<PackageWithTags[]>([]);
  const [allTags, setAllTags] = useState<WorkspaceTag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [expandedCats, setExpandedCats] = useState<Set<string>>(new Set(['package']));
  const [semanticIds, setSemanticIds] = useState<string[] | null>(null);
  const [semanticLoading, setSemanticLoading] = useState(false);
  const [stagedIds, setStagedIds] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState<Set<string>>(new Set());
  const [recentlyAdded, setRecentlyAdded] = useState<string | null>(null);

  // ── Initial load — catalog + tags in parallel ────────────────────────────
  useEffect(() => {
    if (!workspaceId) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    Promise.all([
      getCatalogPackagesWithTags(workspaceId),
      getWorkspaceTags(workspaceId),
    ]).then(([pkgsResult, tagsResult]) => {
      if (cancelled) return;
      setPackages((pkgsResult.packages ?? []).filter((p) => (p as any).is_active !== false && (p as any).is_draft !== true));
      setAllTags(tagsResult.tags ?? []);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [workspaceId]);

  // ── Semantic search — debounced, only when query is non-empty ────────────
  const isSearching = query.trim().length > 0;
  useEffect(() => {
    if (!isSearching || !workspaceId) {
      setSemanticIds(null);
      setSemanticLoading(false);
      return;
    }
    setSemanticLoading(true);
    const handle = setTimeout(async () => {
      const results = await semanticSearchCatalog(workspaceId, query.trim(), 30);
      setSemanticIds(results.map((r) => r.packageId));
      setSemanticLoading(false);
    }, 220);
    return () => { clearTimeout(handle); };
  }, [query, isSearching, workspaceId]);

  // ── Filtered + grouped packages ──────────────────────────────────────────
  const filtered = useMemo(() => {
    let list = packages;

    // Tag filter — AND logic across selected tags.
    if (selectedTagIds.size > 0) {
      list = list.filter((p) => {
        const pkgTagIds = new Set((p.tags ?? []).map((t) => t.id));
        for (const id of selectedTagIds) if (!pkgTagIds.has(id)) return false;
        return true;
      });
    }

    // Search: semantic ids (reordered by similarity) OR plain filter fallback.
    if (isSearching) {
      if (semanticIds !== null) {
        const idSet = new Set(semanticIds);
        list = list.filter((p) => idSet.has(p.id));
        list.sort((a, b) => semanticIds.indexOf(a.id) - semanticIds.indexOf(b.id));
      } else {
        const q = query.trim().toLowerCase();
        list = list.filter(
          (p) =>
            p.name.toLowerCase().includes(q) ||
            (p.description ?? '').toLowerCase().includes(q),
        );
      }
    }

    // Group by category (preserving semantic ordering within each group).
    const groups = new Map<string, PackageWithTags[]>();
    for (const pkg of list) {
      const cat = pkg.category ?? 'package';
      if (!groups.has(cat)) groups.set(cat, []);
      groups.get(cat)!.push(pkg);
    }
    return CATEGORY_ORDER
      .map(({ id, label }) => ({ id, label, items: groups.get(id) ?? [] }))
      .filter((g) => g.items.length > 0);
  }, [packages, selectedTagIds, isSearching, semanticIds, query]);

  const totalMatches = useMemo(
    () => filtered.reduce((n, c) => n + c.items.length, 0),
    [filtered],
  );

  // ── Handlers ─────────────────────────────────────────────────────────────
  const toggleCategory = (id: string) => {
    setExpandedCats((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleTag = (tagId: string) => {
    setSelectedTagIds((prev) => {
      const next = new Set(prev);
      if (next.has(tagId)) next.delete(tagId);
      else next.add(tagId);
      return next;
    });
  };

  const addPackage = useCallback(
    async (pkg: PackageWithTags) => {
      if (forceDemo) {
        toast.info('Demo view — open without ?demo=1 to add real items.');
        return;
      }
      // Swap mode: delete the original + insert this package at the old spot.
      // Sidebar owns the full flow; we just hand off the chosen package id.
      if (swap) {
        setAdding((prev) => new Set(prev).add(pkg.id));
        try {
          await onSwapPick(pkg.id);
        } finally {
          setAdding((prev) => {
            const next = new Set(prev);
            next.delete(pkg.id);
            return next;
          });
        }
        return;
      }
      setAdding((prev) => new Set(prev).add(pkg.id));
      const result = await addPackageToProposal(dealId, pkg.id, insertAfterSortOrder ?? undefined);
      setAdding((prev) => {
        const next = new Set(prev);
        next.delete(pkg.id);
        return next;
      });
      if (result.success) {
        setRecentlyAdded(pkg.id);
        window.setTimeout(() => setRecentlyAdded((current) => (current === pkg.id ? null : current)), 800);
        toast.success(`Added ${pkg.name}`);
        onItemAdded();
      } else {
        toast.error(result.error ?? 'Could not add to proposal.');
      }
    },
    [dealId, forceDemo, insertAfterSortOrder, onItemAdded, swap, onSwapPick],
  );

  const commitStaged = useCallback(async () => {
    if (forceDemo) {
      toast.info('Demo view — open without ?demo=1 to add real items.');
      return;
    }
    const ids = Array.from(stagedIds);
    const stagedPkgs = packages.filter((p) => ids.includes(p.id));
    setStagedIds(new Set());
    // Sequential — server positions each relative to the previous insert.
    let cursor = insertAfterSortOrder;
    for (const pkg of stagedPkgs) {
      const result = await addPackageToProposal(dealId, pkg.id, cursor ?? undefined);
      if (!result.success) {
        toast.error(`${pkg.name}: ${result.error ?? 'failed'}`);
        continue;
      }
      // Next item lands after this one — approximate step (header+children).
      if (cursor != null) cursor += 10;
    }
    toast.success(`Added ${stagedPkgs.length} item${stagedPkgs.length === 1 ? '' : 's'}`);
    onItemAdded();
  }, [stagedIds, packages, insertAfterSortOrder, dealId, forceDemo, onItemAdded]);

  const onRowClick = useCallback(
    (pkg: PackageWithTags, withShift: boolean) => {
      if (withShift) {
        setStagedIds((prev) => {
          const next = new Set(prev);
          if (next.has(pkg.id)) next.delete(pkg.id);
          else next.add(pkg.id);
          return next;
        });
      } else {
        addPackage(pkg);
      }
    },
    [addPackage],
  );

  // ── Render ───────────────────────────────────────────────────────────────
  return (
    <div className="h-full min-h-0 flex flex-col">
      {/* Swap banner — one-shot mode: the next catalog click replaces the
           named line. Cancel restores normal add-to-proposal behavior. */}
      {swap && (
        <div className="shrink-0 mx-3 mb-2 px-3 py-2 rounded-[var(--stage-radius-input)] bg-[var(--ctx-well)] border border-dashed border-[var(--stage-edge-subtle)] flex items-center gap-2">
          <span className="text-[11px] text-[var(--stage-text-secondary)] flex-1 min-w-0 truncate">
            Swapping <span className="text-[var(--stage-text-primary)] font-medium">{swap.title}</span> — pick a replacement
          </span>
          <button
            type="button"
            onClick={onCancelSwap}
            className="shrink-0 text-[11px] text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]"
            aria-label="Cancel swap"
          >
            Cancel
          </button>
        </div>
      )}

      {/* Search + match count */}
      <div className="shrink-0 px-3 pb-2 flex items-center gap-2">
        <label className="relative flex items-center flex-1 min-w-0">
          <Search
            size={13}
            strokeWidth={1.75}
            className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[var(--stage-text-tertiary)] pointer-events-none"
            aria-hidden
          />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search catalog…"
            className="stage-input w-full h-8 text-[13px]"
            style={{ paddingLeft: '30px', paddingRight: '12px' }}
            aria-label="Search catalog"
          />
        </label>
        {isSearching && (
          <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal tabular-nums shrink-0 min-w-[22px] text-right">
            {semanticLoading ? '…' : totalMatches}
          </span>
        )}
      </div>

      {/* Tag filter chip row — horizontal scroll */}
      <div className="shrink-0 px-3 pb-3">
        <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-hide pb-0.5">
          {allTags.map((tag) => {
            const isActive = selectedTagIds.has(tag.id);
            const pill = tagPill(tag.color);
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggleTag(tag.id)}
                className={cn(
                  'shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium border transition-colors whitespace-nowrap flex items-center gap-1',
                  'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
                )}
                style={
                  isActive
                    ? { backgroundColor: pill.bg, borderColor: pill.border, color: 'var(--stage-text-primary)' }
                    : {
                        backgroundColor: 'transparent',
                        borderColor: 'oklch(1 0 0 / 0.08)',
                        color: 'var(--stage-text-secondary)',
                      }
                }
                aria-pressed={isActive}
              >
                <span
                  className="size-1.5 rounded-full"
                  style={{ backgroundColor: pill.dot }}
                  aria-hidden
                />
                {tag.label}
              </button>
            );
          })}

          {selectedTagIds.size > 0 && (
            <button
              type="button"
              onClick={() => setSelectedTagIds(new Set())}
              className="shrink-0 rounded-full px-2 py-0.5 text-[11px] font-medium text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)] transition-colors"
              aria-label="Clear tag filters"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Results — categories */}
      <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain">
        {loading ? (
          <CatalogSkeleton />
        ) : filtered.length === 0 ? (
          <CatalogEmpty
            workspaceId={workspaceId}
            hasPackages={packages.length > 0}
            isFiltered={isSearching || selectedTagIds.size > 0}
          />
        ) : (
          filtered.map((cat) => {
            const isOpen = isSearching || expandedCats.has(cat.id);
            return (
              <section key={cat.id} className="border-b border-[var(--stage-edge-subtle)] last:border-b-0">
                <button
                  type="button"
                  onClick={() => !isSearching && toggleCategory(cat.id)}
                  className="w-full flex items-center gap-2 px-4 py-2.5 text-left hover:bg-[oklch(1_0_0_/_0.02)] transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset"
                >
                  <ChevronDown
                    size={13}
                    strokeWidth={1.75}
                    className={cn(
                      'shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-150',
                      !isOpen && '-rotate-90',
                    )}
                    aria-hidden
                  />
                  <span className="flex-1 stage-readout text-[var(--stage-text-primary)]">
                    {cat.label}
                  </span>
                  <span className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal tabular-nums">
                    {cat.items.length}
                  </span>
                </button>
                {isOpen && (
                  <ul className="flex flex-col pb-1 list-none">
                    {cat.items.map((pkg) => (
                      <li key={pkg.id}>
                        <CatalogItemRow
                          pkg={pkg}
                          onClick={(withShift) => onRowClick(pkg, withShift)}
                          isStaged={stagedIds.has(pkg.id)}
                          isAdding={adding.has(pkg.id)}
                          wasRecentlyAdded={recentlyAdded === pkg.id}
                          isBundle={pkg.category === 'package'}
                        />
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })
        )}
      </div>

      {/* Staged-batch footer bar — appears when ≥1 item staged via shift-click */}
      {stagedIds.size > 0 && (
        <div className="shrink-0 flex items-center gap-2 px-3 py-2.5 border-t border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]">
          <span className="flex-1 text-[12px] text-[var(--stage-text-primary)] font-medium">
            {stagedIds.size} item{stagedIds.size === 1 ? '' : 's'} staged
          </span>
          <button
            type="button"
            onClick={() => setStagedIds(new Set())}
            className="stage-btn stage-btn-ghost inline-flex items-center h-7 text-[12px] px-2"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={commitStaged}
            className="stage-btn stage-btn-primary inline-flex items-center gap-1.5 h-7 text-[12px] px-3"
          >
            Add {stagedIds.size}
          </button>
        </div>
      )}

      {/* Manage-tags footnote */}
      {allTags.length > 0 && (
        <div className="shrink-0 px-3 py-2 border-t border-[var(--stage-edge-subtle)]">
          <Link
            href="/catalog"
            className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal hover:text-[var(--stage-text-primary)] transition-colors"
          >
            Manage tags in Catalog →
          </Link>
        </div>
      )}
    </div>
  );
}

function CatalogItemRow({
  pkg,
  onClick,
  isStaged,
  isAdding,
  wasRecentlyAdded,
  isBundle,
}: {
  pkg: PackageWithTags;
  onClick: (withShift: boolean) => void;
  isStaged: boolean;
  isAdding: boolean;
  wasRecentlyAdded: boolean;
  isBundle: boolean;
}) {
  const unit = (pkg as PackageWithTags & { unit_type?: string }).unit_type ?? 'flat';
  const priceLabel = Number(pkg.price) > 0 ? `$${Number(pkg.price).toLocaleString()}` : '—';
  const unitSuffix = unit === 'hour' ? ' / hr' : unit === 'day' ? ' / day' : '';
  return (
    <button
      type="button"
      onClick={(e) => onClick(e.shiftKey)}
      disabled={isAdding}
      className={cn(
        'group w-full flex items-start gap-3 px-4 py-2.5 text-left transition-colors',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-inset',
        isStaged
          ? 'bg-[var(--stage-accent-muted)]'
          : wasRecentlyAdded
          ? 'bg-[oklch(0.75_0.18_145_/_0.08)]'
          : 'hover:bg-[oklch(1_0_0_/_0.025)]',
        isAdding && 'opacity-60 cursor-wait',
      )}
    >
      <div className="flex-1 min-w-0 flex flex-col gap-1">
        <span className="text-[13px] text-[var(--stage-text-primary)] font-medium truncate flex items-center gap-1.5">
          {isBundle && (
            <span
              className="shrink-0 stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal px-1 py-px rounded-sm border border-[var(--stage-edge-subtle)] text-[9px] uppercase"
              style={{ lineHeight: 1 }}
            >
              Bundle
            </span>
          )}
          <span className="truncate">{pkg.name}</span>
        </span>
        {pkg.description && (
          <span className="text-[12px] leading-[1.45] text-[var(--stage-text-tertiary)] line-clamp-2">
            {pkg.description}
          </span>
        )}
        {pkg.tags && pkg.tags.length > 0 && (
          <div className="flex items-center gap-1 flex-wrap mt-0.5">
            {pkg.tags.slice(0, 3).map((tag) => {
              const pill = tagPill(tag.color);
              return (
                <span
                  key={tag.id}
                  className="inline-flex items-center gap-1 rounded-full px-1.5 py-px text-[10px] border"
                  style={{ backgroundColor: pill.bg, borderColor: pill.border, color: 'var(--stage-text-secondary)' }}
                >
                  <span className="size-1 rounded-full" style={{ backgroundColor: pill.dot }} aria-hidden />
                  {tag.label}
                </span>
              );
            })}
            {pkg.tags.length > 3 && (
              <span className="text-[10px] text-[var(--stage-text-tertiary)]">
                +{pkg.tags.length - 3}
              </span>
            )}
          </div>
        )}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1">
        <span className="text-[12px] tabular-nums text-[var(--stage-text-secondary)] whitespace-nowrap">
          {priceLabel}
          {unitSuffix && (
            <span className="text-[var(--stage-text-tertiary)]">{unitSuffix}</span>
          )}
        </span>
        <span
          className={cn(
            'size-5 inline-flex items-center justify-center rounded-full border transition-colors',
            isStaged
              ? 'bg-[var(--stage-accent)] border-transparent text-[oklch(0.10_0_0)]'
              : wasRecentlyAdded
              ? 'bg-[var(--color-unusonic-success)] border-transparent text-[oklch(0.10_0_0)]'
              : 'bg-[var(--stage-surface-raised)] border-[var(--stage-edge-subtle)] text-[var(--stage-text-secondary)] group-hover:text-[var(--stage-text-primary)] group-hover:bg-[var(--stage-accent-muted)]',
          )}
          aria-hidden
        >
          {isAdding ? (
            <AionMark size={14} status="loading" />
          ) : wasRecentlyAdded ? (
            '✓'
          ) : isStaged ? (
            '✓'
          ) : (
            <Plus size={11} strokeWidth={2} />
          )}
        </span>
      </div>
    </button>
  );
}

function CatalogSkeleton() {
  return (
    <div className="flex flex-col gap-2 px-4 py-4">
      {[0, 1, 2, 3].map((i) => (
        <div key={i} className="flex items-start gap-3 py-2">
          <div className="flex-1 flex flex-col gap-1.5">
            <div className="h-3 rounded bg-[var(--ctx-well)] stage-skeleton" style={{ width: `${60 + (i % 3) * 10}%` }} />
            <div className="h-2.5 rounded bg-[var(--ctx-well)] stage-skeleton" style={{ width: `${40 + (i % 2) * 15}%` }} />
          </div>
          <div className="h-4 w-10 rounded bg-[var(--ctx-well)] stage-skeleton" />
        </div>
      ))}
    </div>
  );
}

function CatalogEmpty({
  workspaceId,
  hasPackages,
  isFiltered,
}: {
  workspaceId: string | null;
  hasPackages: boolean;
  isFiltered: boolean;
}) {
  if (!workspaceId) {
    return (
      <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
        <p className="stage-readout text-[var(--stage-text-secondary)]">Workspace unavailable</p>
      </div>
    );
  }
  if (isFiltered && hasPackages) {
    return (
      <div className="px-4 py-10 flex flex-col items-center gap-1 text-center">
        <p className="stage-readout text-[var(--stage-text-secondary)]">No matches</p>
        <p className="stage-label text-[var(--stage-text-tertiary)] normal-case tracking-normal">
          Try a different search or clear your tag filters.
        </p>
      </div>
    );
  }
  return (
    <div className="px-4 py-10 flex flex-col items-center gap-2 text-center">
      <p className="stage-readout text-[var(--stage-text-secondary)]">No catalog items yet</p>
      <Link
        href="/catalog"
        className="stage-label text-[var(--stage-accent)] normal-case tracking-normal hover:underline"
      >
        Add items in Catalog →
      </Link>
    </div>
  );
}
