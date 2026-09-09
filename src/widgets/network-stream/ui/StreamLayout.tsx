'use client';

import { useCallback, useRef, useState, useTransition, useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown } from 'lucide-react';
import { NetworkCard, NetworkRow } from '@/entities/network';
import { reservedSlotCount } from '@/entities/network/model/card-slots';
import { filterNodes } from '@/entities/network/model/search-node';
import { sortNodes, DEFAULT_SORT, type SortMode } from '@/entities/network/model/sort-nodes';
import { SortControl } from './SortControl';
import { StarredStrip } from './StarredStrip';
import { GenesisState } from './GenesisState';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import type { NetworkNode } from '@/entities/network';
import { isInCategory, isUnsorted } from '@/entities/network/model/categories';
import { categoryLabels, DEFAULT_LABEL_PACK, type LabelPack } from '@/entities/network/model/label-packs';
import { CategorySection } from './CategorySection';

// =============================================================================
// Helpers: classify nodes into zones using existing kind/gravity/entityType
// =============================================================================

/**
 * Zone membership is derived from role edges, never from `gravity`.
 *
 * The previous predicates all gated on `gravity === 'inner_circle'` -- the star
 * -- so starring someone moved them between zones, and an unstarred client was
 * indistinguishable from an unstarred freelancer. Membership now comes from
 * categoriesOf(), and an entity holding several roles appears in each.
 */
function isRosterNode(n: NetworkNode): boolean {
  return isInCategory(n, 'roster');
}

function isClientNode(n: NetworkNode): boolean {
  return isInCategory(n, 'clients');
}

/** Vendors, venues, and anything holding no recognised role yet. */
function isOtherNode(n: NetworkNode): boolean {
  return isInCategory(n, 'vendors') || isInCategory(n, 'venues') || isUnsorted(n);
}

// =============================================================================
// Crew zone: role grouping
// =============================================================================

function groupByRole(nodes: NetworkNode[]): Map<string, NetworkNode[]> {
  const groups = new Map<string, NetworkNode[]>();
  for (const node of nodes) {
    const key = node.roleGroup || 'Other';
    const arr = groups.get(key) ?? [];
    arr.push(node);
    groups.set(key, arr);
  }
  // Sort groups alphabetically, but "Other" always last
  const sorted = new Map<string, NetworkNode[]>();
  const keys = [...groups.keys()].sort((a, b) => {
    if (a === 'Other') return 1;
    if (b === 'Other') return -1;
    return a.localeCompare(b);
  });
  for (const key of keys) sorted.set(key, groups.get(key)!);
  return sorted;
}

// =============================================================================
// Category membership
// =============================================================================



// =============================================================================
// Optimistic updates
// =============================================================================

type OptimisticAction =
  | { type: 'remove'; id: string }
  | { type: 'toggle_star'; id: string; starred: boolean };

// =============================================================================
// Component
// =============================================================================

interface StreamLayoutProps {
  nodes: NetworkNode[];
  onNodeClick?: (node: NetworkNode) => void;
  /**
   * Optional hover callback fired after a 150ms intent delay. Used by the
   * orbit view to prefetch the network-detail bundle so the sheet opens
   * with warm data when the click lands. Per perf-patterns.md §4 (three-tier
   * anticipatory prefetch).
   */
  onNodeHover?: (node: NetworkNode) => void;
  /**
   * Toggle the current user's star on an entity. Personal and silent -- this
   * replaces the old pin/unpin pair, which wrote the shared relationship tier.
   */
  onToggleStar?: (entityId: string, starred: boolean) => Promise<{ ok: boolean; error?: string }>;
  /** Workspace display vocabulary. Category keys are unaffected. */
  labelPack?: LabelPack;
  /** Crew role slug -> label, for in-category role filtering. */
  roleLabels?: Record<string, string>;
  hasIdentity?: boolean;
  hasTeam?: boolean;
  brandColor?: string | null;
  onOpenOmni?: () => void;
  onOpenProfile?: () => void;
}

export function StreamLayout({
  nodes,
  onNodeClick,
  onNodeHover,
  onToggleStar,
  labelPack = DEFAULT_LABEL_PACK,
  roleLabels,
  hasIdentity = false,
  hasTeam = false,
  brandColor = null,
  onOpenOmni,
  onOpenProfile,
}: StreamLayoutProps) {
  const router = useRouter();

  // Affiliated people often have no direct edge to the workspace, so they are
  // not nodes in this stream and cannot be opened as one. Route to the entity
  // page instead -- the same destination TeamCard uses from a company sheet.
  const openAffiliate = useCallback(
    (entityId: string) => router.push(`/network/entity/${entityId}`),
    [router],
  );

  // Hover prefetch with intent delay — fires onNodeHover only after the
  // pointer has rested on a card for 150ms. Cancels if the pointer leaves
  // before the timer fires, so accidental fly-overs don't trigger fetches.
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const handleNodeHoverEnter = useCallback(
    (node: NetworkNode) => {
      if (!onNodeHover) return;
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = setTimeout(() => onNodeHover(node), 150);
    },
    [onNodeHover],
  );
  const handleNodeHoverLeave = useCallback(() => {
    if (hoverTimerRef.current) {
      clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
  }, []);
  const [, startTransition] = useTransition();
  const [crewSearch, setCrewSearch] = useState('');
  const [innerCircleSearch, setInnerCircleSearch] = useState('');
  const [crewExpanded, setCrewExpanded] = useState(true);
  const [innerCircleExpanded, setInnerCircleExpanded] = useState(true);
  const [activeRoleFilter, setActiveRoleFilter] = useState<string | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>(DEFAULT_SORT);

  const [optimisticNodes, dispatchOptimistic] = useOptimistic(
    nodes,
    (current: NetworkNode[], action: OptimisticAction) => {
      if (action.type === 'remove') return current.filter((n) => n.id !== action.id);
      if (action.type === 'toggle_star') {
        return current.map((n) =>
          n.id === action.id ? { ...n, starred: action.starred } : n
        );
      }
      return current;
    }
  );

  // Classify into zones
  const crewNodes = optimisticNodes.filter(isRosterNode);
  const innerCircleNodes = optimisticNodes.filter(isClientNode);
  // Starred entities appear in a strip above the categories AND stay in their
  // category below. A star is a shortcut, not a relocation -- moving something
  // out of its category when you pin it is the mistake Inner Circle made.
  const labels = categoryLabels(labelPack);
  const starredNodes = optimisticNodes.filter((n) => n.starred);
  const vendorNodes = optimisticNodes.filter((n) => isInCategory(n, 'vendors'));
  const venueNodes = optimisticNodes.filter((n) => isInCategory(n, 'venues'));
  const unsortedNodes = optimisticNodes.filter(isUnsorted);
  // Kept for the Genesis empty-state check below — an entity in any of the
  // three sections means the workspace is no longer empty.
  const networkNodes = optimisticNodes.filter(isOtherNode);

  const showGenesis = crewNodes.length === 0 && innerCircleNodes.length === 0 && networkNodes.length === 0;

  /**
   * Toggle the CURRENT user's star.
   *
   * This used to write `tier` on the shared relationship edge, which meant one
   * person's shortcut changed what everyone saw -- and, because zone membership
   * keyed off tier, changed which zone the entity appeared in. Stars are now
   * per-user rows and affect nothing but this user's view.
   */
  const handleToggleStar = (node: NetworkNode) => {
    if (!onToggleStar) return;
    const nextStarred = !node.starred;
    startTransition(async () => {
      dispatchOptimistic({ type: 'toggle_star', id: node.id, starred: nextStarred });
      const result = await onToggleStar(node.entityId, nextStarred);
      if (result.ok) router.refresh();
    });
  };

  // Crew zone: search, role grouping and filtering
  const searchedCrewNodes = sortNodes(filterNodes(crewNodes, crewSearch), sortMode);
  const roleGroups = groupByRole(searchedCrewNodes);
  const allRoleKeys = [...groupByRole(crewNodes).keys()]; // Use unfiltered for pill labels
  const filteredCrewNodes = activeRoleFilter
    ? searchedCrewNodes.filter((n) => (n.roleGroup || 'Other') === activeRoleFilter)
    : searchedCrewNodes;
  const filteredRoleGroups = activeRoleFilter
    ? new Map([[activeRoleFilter, filteredCrewNodes]])
    : roleGroups;

  // Inner Circle zone: search
  const displayedInnerCircle = sortNodes(filterNodes(innerCircleNodes, innerCircleSearch), sortMode);

  // Every grid reserves its own rows; without it a section of bare names
  // renders three blank lines under each card.
  const sortedStarred = sortNodes(starredNodes, sortMode);

  return (
    <div className={cn('relative flex w-full flex-col gap-8', showGenesis && 'flex-1 min-h-0')}>

      {/* One ordering for the page: the question is asked of the directory. */}
      {!showGenesis && (
        <div className="flex justify-end">
          <SortControl value={sortMode} onChange={setSortMode} />
        </div>
      )}
      <StarredStrip
        nodes={sortedStarred}
        onNodeClick={onNodeClick}
        onAffiliateClick={openAffiliate}
        onNodeHoverEnter={handleNodeHoverEnter}
        onNodeHoverLeave={handleNodeHoverLeave}
        onToggleStar={onToggleStar ? handleToggleStar : undefined}
      />

      {/* ── Roster — staff, contractors and freelancers (ROSTER_MEMBER / PARTNER) ── */}
      {crewNodes.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCrewExpanded((v) => !v)}
              className="flex items-center gap-2 text-left group"
            >
              <h2 className="stage-label text-[var(--stage-text-secondary)]">
                {labels.roster}
              </h2>
              <span className="shrink-0 rounded-full bg-[oklch(1_0_0/0.06)] px-2.5 py-0.5 stage-badge-text tabular-nums text-[var(--stage-text-secondary)]">
                {crewNodes.length}
              </span>
              <ChevronDown
                className={cn(
                  'size-3.5 text-[var(--stage-text-secondary)] transition-transform duration-[120ms]',
                  crewExpanded && 'rotate-180'
                )}
              />
            </button>
            {crewExpanded && (
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--stage-text-secondary)]/60 pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search crew…"
                  aria-label="Search crew"
                  value={crewSearch}
                  onChange={(e) => setCrewSearch(e.target.value)}
                  className={cn(
                    'stage-input h-8 !pl-7 pr-3 text-xs',
                    'focus-visible:outline-none',
                    crewSearch ? 'w-40' : 'w-28 focus:w-40'
                  )}
                />
              </div>
            )}
          </div>

          <AnimatePresence>
            {crewExpanded && (
              <motion.div
                key="crew-content"
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: 'auto' }}
                exit={{ opacity: 0, height: 0 }}
                transition={STAGE_MEDIUM}
                className="overflow-hidden"
              >
                {/* Role filter pills */}
                {allRoleKeys.length > 1 && (
                  <div className="mb-4 flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => setActiveRoleFilter(null)}
                      className={cn(
                        'rounded-xl px-3 py-1.5 stage-badge-text transition-colors duration-100',
                        !activeRoleFilter
                          ? 'bg-[var(--stage-accent)]/15 text-[var(--stage-accent)] shadow-[inset_0_0_0_1px_var(--stage-accent)/30]'
                          : 'bg-[oklch(1_0_0/0.05)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]'
                      )}
                    >
                      All
                    </button>
                    {allRoleKeys.map((key) => (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setActiveRoleFilter(activeRoleFilter === key ? null : key)}
                        className={cn(
                          'flex items-center gap-1.5 rounded-xl px-3 py-1.5 stage-badge-text transition-colors duration-100',
                          activeRoleFilter === key
                            ? 'bg-[var(--stage-accent)]/15 text-[var(--stage-accent)] shadow-[inset_0_0_0_1px_var(--stage-accent)/30]'
                            : 'bg-[oklch(1_0_0/0.05)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]'
                        )}
                      >
                        {key}
                        <span
                          className={cn(
                            'rounded-full px-1.5 py-px stage-badge-text tabular-nums',
                            activeRoleFilter === key
                              ? 'bg-[var(--stage-accent)]/20 text-[var(--stage-accent)]'
                              : 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]'
                          )}
                        >
                          {roleGroups.get(key)?.length ?? 0}
                        </span>
                      </button>
                    ))}
                  </div>
                )}

                {/* Role-grouped cards */}
                {filteredCrewNodes.length > 0 ? (
                  <div className="flex flex-col gap-6">
                    {[...filteredRoleGroups.entries()].map(([role, groupNodes]) => (
                      <div key={role}>
                        {/* Only show role header if there are multiple groups and no active filter */}
                        {allRoleKeys.length > 1 && !activeRoleFilter && (
                          <p className="mb-2 stage-label text-[var(--stage-text-secondary)]/60">
                            {role}
                          </p>
                        )}
                        <div className="grid grid-cols-2 gap-[var(--stage-gap)] sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5">
                          {groupNodes.map((node) => (
                            <div
                              key={node.id}
                              className="h-full"
                              onMouseEnter={() => handleNodeHoverEnter(node)}
                              onMouseLeave={handleNodeHoverLeave}
                            >
                              <NetworkCard
                                node={node}
                                slotCount={reservedSlotCount(groupNodes)}
                                layoutId={`node-${node.id}`}
                                onClick={() => onNodeClick?.(node)}
                  onAffiliateClick={openAffiliate}
                              />
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-10 text-center">
                    <p className="stage-label text-[var(--stage-text-secondary)]">
                      No results for <span className="text-[var(--stage-text-primary)]">&ldquo;{crewSearch}&rdquo;</span>
                    </p>
                    <button type="button" onClick={() => { setCrewSearch(''); setActiveRoleFilter(null); }} className="mt-2 stage-badge-text text-[var(--stage-accent)] hover:underline">
                      Clear filter
                    </button>
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </section>
      )}

      {/* ── Clients — anyone on a CLIENT edge, person or company ── */}
      {innerCircleNodes.length > 0 && (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setInnerCircleExpanded((v) => !v)}
                className="flex items-center gap-2 text-left group"
              >
                <h2 className="stage-label text-[var(--stage-text-secondary)]">
                  {labels.clients}
                </h2>
                <span className="shrink-0 rounded-full bg-[oklch(1_0_0/0.06)] px-2.5 py-0.5 stage-badge-text tabular-nums text-[var(--stage-text-secondary)]">
                  {innerCircleNodes.length}
                </span>
                <ChevronDown
                  className={cn(
                    'size-3.5 text-[var(--stage-text-secondary)] transition-transform duration-[120ms]',
                    innerCircleExpanded && 'rotate-180'
                  )}
                />
              </button>
              {innerCircleExpanded && innerCircleNodes.length > 3 && (
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--stage-text-secondary)]/60 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search partners…"
                    aria-label="Search inner circle"
                    value={innerCircleSearch}
                    onChange={(e) => setInnerCircleSearch(e.target.value)}
                    className={cn(
                      'stage-input h-8 !pl-7 pr-3 text-xs',
                      'focus-visible:outline-none',
                      innerCircleSearch ? 'w-40' : 'w-28 focus:w-40'
                    )}
                  />
                </div>
              )}
            </div>
            <AnimatePresence>
              {innerCircleExpanded && (
                <motion.div
                  key="inner-circle-content"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={STAGE_MEDIUM}
                  className="overflow-hidden"
                >
                  {displayedInnerCircle.length > 0 ? (
                    <div className="flex flex-col divide-y divide-[var(--stage-edge-subtle)] pb-2">
                      {displayedInnerCircle.map((node) => (
                        <div
                          key={node.id}
                          onMouseEnter={() => handleNodeHoverEnter(node)}
                          onMouseLeave={handleNodeHoverLeave}
                        >
                          <NetworkRow
                            node={node}
                            onClick={() => onNodeClick?.(node)}
                            onAffiliateClick={openAffiliate}
                          />
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                      <p className="stage-label text-[var(--stage-text-secondary)]">
                        No results for <span className="text-[var(--stage-text-primary)]">&ldquo;{innerCircleSearch}&rdquo;</span>
                      </p>
                      <button type="button" onClick={() => setInnerCircleSearch('')} className="mt-2 stage-badge-text text-[var(--stage-accent)] hover:underline">
                        Clear filter
                      </button>
                    </div>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </section>
        </>
      )}

      {/* ── Vendors · Venues · Unsorted ──────────────────────────────────
           Sections replace the old "Network" residual zone and its filter
           chips: a category you can see beats one you have to filter for.
           Unsorted is a holding pen to be emptied, so it sits last and
           collapsed rather than reading as a fourth peer. */}
      <AnimatePresence mode="wait">
        {showGenesis ? (
          <GenesisState
            key="genesis"
            hasIdentity={hasIdentity}
            hasTeam={hasTeam}
            brandColor={brandColor}
            onOpenOmni={onOpenOmni}
            onOpenProfile={onOpenProfile}
          />
        ) : (
          <motion.div
            key="category-sections"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="flex flex-col gap-8"
          >
            <CategorySection
              layout="rows"
              title={labels.vendors}
              nodes={vendorNodes}
              roleLabels={roleLabels}
              onNodeClick={onNodeClick}
              onAffiliateClick={openAffiliate}
              onNodeHoverEnter={handleNodeHoverEnter}
              onNodeHoverLeave={handleNodeHoverLeave}
              onTogglePreferred={onToggleStar ? handleToggleStar : undefined}
              sortMode={sortMode}
            />
            <CategorySection
              title={labels.venues}
              nodes={venueNodes}
              roleLabels={roleLabels}
              onNodeClick={onNodeClick}
              onAffiliateClick={openAffiliate}
              onNodeHoverEnter={handleNodeHoverEnter}
              onNodeHoverLeave={handleNodeHoverLeave}
              onTogglePreferred={onToggleStar ? handleToggleStar : undefined}
              sortMode={sortMode}
              /* Rooms, not faces. A venue's deciding fact is where it is, an
                 avatar tile says nothing about it, and there are more of them
                 than of anyone else -- so this is the clearest case in the
                 directory for a row over a card. */
              layout="rows"
            />
            <CategorySection
              layout="rows"
              title="Unsorted"
              nodes={unsortedNodes}
              defaultExpanded={false}
              emptyLabel="Nothing waiting to be filed."
              onNodeClick={onNodeClick}
              onAffiliateClick={openAffiliate}
              onNodeHoverEnter={handleNodeHoverEnter}
              onNodeHoverLeave={handleNodeHoverLeave}
              onTogglePreferred={onToggleStar ? handleToggleStar : undefined}
              sortMode={sortMode}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
