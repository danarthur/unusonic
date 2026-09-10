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

import { NetworkCard, NetworkRow } from '@/entities/network';
import { rowFactsFor } from '@/entities/network/model/row-facts';
import { reservedSlotCount } from '@/entities/network/model/card-slots';
import { filterNodes } from '@/entities/network/model/search-node';
import { sortNodes, DEFAULT_SORT, type SortMode } from '@/entities/network/model/sort-nodes';

/** Cards until a section says otherwise. */
const DEFAULT_LAYOUT = 'cards' as const;
import type { NetworkNode } from '@/entities/network';
import { RoleFilterRow, ROLE_FILTER_MIN_ROWS } from './RoleFilterRow';
import { EditableRate } from '@/features/network-data/ui/EditableRate';

export interface CategorySectionProps {
  title: string;
  nodes: NetworkNode[];
  /** Shown under the title when the category is empty of search results. */
  emptyLabel?: string;
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
  /**
   * Cards or rows.
   *
   * Cards are earned rather than default: a section wants them only when it is
   * small, everyone in it has a face worth recognising, and the task is
   * comparison. Everywhere else a row says the same things without promising
   * content a thin record does not have.
   */
  layout?: 'cards' | 'rows';
  /** A trailing control per row, for sections that offer one. Rows only. */
  renderRowAction?: (node: NetworkNode) => React.ReactNode;
  /** Called after an inline edit on a row, so the page can re-read. */
  onRowChanged?: () => void;
  /**
   * The page's one search query.
   *
   * Sections used to own their own input. Three of them existed with three
   * labels and three thresholds, each searching only its own list -- so a name
   * filed in a section you were not looking at returned nothing, and read as
   * nothing. Scope is a dimension of one search now, never a boundary with its
   * own box.
   */
  query?: string;
  /** Clears the page search from a section's empty state. */
  onClearQuery?: () => void;
}

export function CategorySection({
  title,
  nodes,
  sortMode = DEFAULT_SORT,
  layout,
  renderRowAction,
  onRowChanged,
  query = '',
  onClearQuery,
  emptyLabel = 'Nothing here yet.',
  roleLabels,
  onNodeClick,
  onAffiliateClick,
  onNodeHoverEnter,
  onNodeHoverLeave,
  onTogglePreferred,
}: CategorySectionProps) {
  const [role, setRole] = useState<string | null>(null);

  if (nodes.length === 0) return null;

  const { rolesPresent, showRoles, activeRole, shown } = resolveVisibleNodes({
    nodes, roleLabels, search: query, role, sortMode,
  });

  // A section whose every row was filtered out says nothing rather than
  // printing a heading over an empty space -- the page-level empty state
  // speaks for all of them at once.
  if (query.trim() && shown.length === 0) return null;

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        {/* A heading, not a control. Collapsing was a second way to do what the
            category chips already do, and it was what made a section's search
            disappear -- collapsed rows were unmounted, so neither this page's
            search nor the browser's own find-in-page could reach them. */}
        <h2 className="flex items-center gap-2 stage-label text-[var(--stage-text-secondary)]">
          {title}
          <span className="shrink-0 rounded-full bg-[oklch(1_0_0/0.06)] px-2.5 py-0.5 stage-badge-text tabular-nums">
            {shown.length === nodes.length ? nodes.length : `${shown.length} of ${nodes.length}`}
          </span>
        </h2>
      </div>

      {showRoles && (
        <RoleFilterRow
          roles={rolesPresent}
          active={activeRole}
          labels={roleLabels}
          onSelect={setRole}
        />
      )}

      <CategoryBody
        shown={shown}
        layout={layout}
        renderRowAction={renderRowAction}
        onRowChanged={onRowChanged}
        onAffiliateClick={onAffiliateClick}
        search={query}
        emptyLabel={emptyLabel}
        onClearSearch={onClearQuery ?? (() => {})}
        onNodeClick={onNodeClick}
        onNodeHoverEnter={onNodeHoverEnter}
        onNodeHoverLeave={onNodeHoverLeave}
        onTogglePreferred={onTogglePreferred}
      />
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
  // A screenful, not a headcount. Below this the eye does the filtering and the
  // control is a decision nobody needed to make.
  const showRoles = nodes.length >= ROLE_FILTER_MIN_ROWS && rolesPresent.length > 1;
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
  layout = DEFAULT_LAYOUT,
  renderRowAction,
  onRowChanged,
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
  layout?: 'cards' | 'rows';
  /** A trailing control per row, for sections that offer one. Rows only. */
  renderRowAction?: (node: NetworkNode) => React.ReactNode;
  onRowChanged?: () => void;
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

  if (layout === 'rows') {
    // One column set for the whole list: Material's rule is that content may
    // run ragged between rows but position may not.
    const facts = rowFactsFor(shown);
    return (
      // Divided rather than gapped: a hairline is what tells the eye where one
      // row ends when they sit flush. Padded at the foot so the last row does
      // not run into whatever follows the section.
      <div className="flex flex-col divide-y divide-[var(--stage-edge-subtle)] pb-2">
        {shown.map((node) => (
          <div
            key={node.id}
            onMouseEnter={() => onNodeHoverEnter?.(node)}
            onMouseLeave={onNodeHoverLeave}
          >
            <NetworkRow
              node={node}
              facts={facts}
              action={renderRowAction?.(node)}
              rateEditor={
                <EditableRate
                  entityId={node.entityId}
                  rate={node.meta.rate ?? null}
                  onSaved={onRowChanged}
                />
              }
              onClick={() => onNodeClick?.(node)}
              onAffiliateClick={onAffiliateClick}
            />
          </div>
        ))}
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
