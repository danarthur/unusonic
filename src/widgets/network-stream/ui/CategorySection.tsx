'use client';

/**
 * One network category rendered as a peer section — Vendors, Venues, or the
 * Unsorted holding pen.
 *
 * Replaces the old single "Network" zone, which was a residual bucket holding
 * every kind of relationship at once behind filter chips. Sections replace
 * those chips: a category you can see is easier to reach than a category you
 * have to filter for.
 *
 * @module widgets/network-stream/ui/CategorySection
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ChevronDown, Search } from 'lucide-react';

import { NetworkCard } from '@/entities/network';
import { reservedSlotCount } from '@/entities/network/model/card-slots';
import { filterNodes } from '@/entities/network/model/search-node';
import { sortNodes, DEFAULT_SORT, type SortMode } from '@/entities/network/model/sort-nodes';
import type { NetworkNode } from '@/entities/network';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { ROLE_GROUPING_THRESHOLD } from '@/entities/network/model/role-vocabulary';
import { cn } from '@/shared/lib/utils';

export interface CategorySectionProps {
  title: string;
  nodes: NetworkNode[];
  /** Shown under the title when the category is empty of search results. */
  emptyLabel?: string;
  /** Collapsed by default for lower-traffic categories. */
  defaultExpanded?: boolean;
  /** Role slug -> label, for the role filter. Empty disables role filtering. */
  roleLabels?: Record<string, string>;
  onNodeClick?: (node: NetworkNode) => void;
  /** Open a person listed under a company card. See NetworkCard.onAffiliateClick. */
  onAffiliateClick?: (entityId: string) => void;
  onNodeHoverEnter?: (node: NetworkNode) => void;
  onNodeHoverLeave?: () => void;
  onTogglePreferred?: (node: NetworkNode) => void;
  /** Page-level ordering. One question asked of the directory, not per section. */
  sortMode?: SortMode;
}

export function CategorySection({
  title,
  nodes,
  sortMode = DEFAULT_SORT,
  emptyLabel = 'Nothing here yet.',
  defaultExpanded = true,
  roleLabels,
  onNodeClick,
  onAffiliateClick,
  onNodeHoverEnter,
  onNodeHoverLeave,
  onTogglePreferred,
}: CategorySectionProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const [search, setSearch] = useState('');
  const [role, setRole] = useState<string | null>(null);

  if (nodes.length === 0) return null;

  const { rolesPresent, showRoles, activeRole, shown } = resolveVisibleNodes({
    nodes, roleLabels, search, role, sortMode,
  });

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          aria-expanded={expanded}
          className="flex items-center gap-2 text-left"
        >
          <h2 className="stage-label text-[var(--stage-text-secondary)]">{title}</h2>
          <span className="shrink-0 rounded-full bg-[oklch(1_0_0/0.06)] px-2.5 py-0.5 stage-badge-text tabular-nums text-[var(--stage-text-secondary)]">
            {nodes.length}
          </span>
          <ChevronDown
            className={cn(
              'size-3.5 text-[var(--stage-text-secondary)] transition-transform duration-[120ms]',
              expanded && 'rotate-180',
            )}
          />
        </button>

        {/* Search earns its place once a category is too long to scan. */}
        {expanded && nodes.length > 8 && (
          <div className="relative ml-auto">
            <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--stage-text-secondary)]/60 pointer-events-none" />
            <input
              type="text"
              placeholder="Search…"
              aria-label={`Search ${title}`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className={cn(
                'stage-input h-8 !pl-7 pr-3 text-xs focus-visible:outline-none',
                search ? 'w-40' : 'w-28 focus:w-40',
              )}
            />
          </div>
        )}
      </div>

      {showRoles && expanded && (
        <RoleChipRow
          rolesPresent={rolesPresent}
          activeRole={activeRole}
          roleLabels={roleLabels}
          onSelect={setRole}
        />
      )}

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            key="body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_MEDIUM}
            className="overflow-hidden"
          >
            <CategoryBody
              shown={shown}
              onAffiliateClick={onAffiliateClick}
              search={search}
              emptyLabel={emptyLabel}
              onClearSearch={() => setSearch('')}
              onNodeClick={onNodeClick}
              onNodeHoverEnter={onNodeHoverEnter}
              onNodeHoverLeave={onNodeHoverLeave}
              onTogglePreferred={onTogglePreferred}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/**
 * Which nodes to render, and whether the role chips have earned their place.
 *
 * Role filtering only appears once a category is too long to scan. Below the
 * threshold the whole list is visible and the chips are noise -- which is how a
 * small workspace stays flat and a large one gains structure without either
 * having to configure anything.
 */
function resolveVisibleNodes({ nodes, roleLabels, search, role, sortMode }: {
  nodes: NetworkNode[];
  roleLabels: Record<string, string> | undefined;
  search: string;
  role: string | null;
  sortMode: SortMode;
}) {
  const rolesPresent = roleLabels
    ? [...new Set(nodes.flatMap((n) => n.crewRoles ?? []))].filter((r) => roleLabels[r])
    : [];
  const showRoles = nodes.length >= ROLE_GROUPING_THRESHOLD && rolesPresent.length > 1;
  const activeRole = showRoles ? role : null;

  // Was name-only here while the roster searched three fields, so the same
  // query found somebody in one section and missed them in another.
  let shown = filterNodes(nodes, search);
  // A person holding two roles matches under both -- never filed under one.
  if (activeRole) shown = shown.filter((n) => (n.crewRoles ?? []).includes(activeRole));

  // Sorted last, so the order holds whatever the search and role filters left.
  return { rolesPresent, showRoles, activeRole, shown: sortNodes(shown, sortMode) };
}

/** Role filter chips. Extracted so CategorySection stays under the complexity cap. */
function RoleChipRow({
  rolesPresent,
  activeRole,
  roleLabels,
  onSelect,
}: {
  rolesPresent: string[];
  activeRole: string | null;
  roleLabels: Record<string, string> | undefined;
  onSelect: (r: string | null) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {[null, ...rolesPresent].map((r) => {
        const on = activeRole === r;
        const label = r === null ? 'All' : (roleLabels?.[r] ?? r);
        return (
          <button
            key={r ?? '__all'}
            type="button"
            aria-pressed={on}
            onClick={() => onSelect(r)}
            className={cn(
              'rounded-[var(--stage-radius-input,6px)] px-2 py-0.5 text-[11px] tracking-tight transition-colors',
              'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              on
                ? 'bg-[var(--ctx-card)] text-[var(--stage-text-primary)] border border-[oklch(1_0_0_/_0.12)]'
                : 'text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] border border-transparent hover:bg-[oklch(1_0_0_/_0.05)]',
            )}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}

/** Card grid or empty state. Extracted to keep CategorySection under the cap. */
function CategoryBody({
  shown,
  search,
  emptyLabel,
  onClearSearch,
  onNodeClick,
  onAffiliateClick,
  onNodeHoverEnter,
  onNodeHoverLeave,
  onTogglePreferred,
}: {
  shown: NetworkNode[];
  search: string;
  emptyLabel: string;
  onClearSearch: () => void;
  onNodeClick?: (n: NetworkNode) => void;
  onAffiliateClick?: (entityId: string) => void;
  onNodeHoverEnter?: (n: NetworkNode) => void;
  onNodeHoverLeave?: () => void;
  onTogglePreferred?: (n: NetworkNode) => void;
}) {
  if (shown.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-center">
        <p className="stage-label text-[var(--stage-text-secondary)]">
          {search ? (
            <>No results for <span className="text-[var(--stage-text-primary)]">&ldquo;{search}&rdquo;</span></>
          ) : (
            emptyLabel
          )}
        </p>
        {search && (
          <button
            type="button"
            onClick={onClearSearch}
            className="mt-2 stage-badge-text text-[var(--stage-accent)] hover:underline"
          >
            Clear filter
          </button>
        )}
      </div>
    );
  }

  // One reservation for the whole grid, so cards align without any of them
  // holding space for a field none of them has.
  const slotCount = reservedSlotCount(shown);

  return (
    <div className="grid grid-cols-1 gap-[var(--stage-gap)] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
      {shown.map((node) => (
        <div
          key={node.id}
          className="h-full"
          onMouseEnter={() => onNodeHoverEnter?.(node)}
          onMouseLeave={onNodeHoverLeave}
        >
          <NetworkCard
            node={node}
            layoutId={`node-${node.id}`}
            onClick={() => onNodeClick?.(node)}
            onAffiliateClick={onAffiliateClick}
            onTogglePreferred={onTogglePreferred ? () => onTogglePreferred(node) : undefined}
            slotCount={slotCount}
          />
        </div>
      ))}
    </div>
  );
}
