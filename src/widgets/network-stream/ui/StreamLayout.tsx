'use client';

import { useCallback, useRef, useState, useTransition, useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { NetworkRow } from '@/entities/network';
import { rowFactsFor } from '@/entities/network/model/row-facts';
import { filterNodes } from '@/entities/network/model/search-node';
import { sortNodes, DEFAULT_SORT, type SortMode } from '@/entities/network/model/sort-nodes';
import { SortControl } from './SortControl';
import { CategoryTabs, type CategoryFilter } from './CategoryTabs';
import { ContactSearch } from './ContactSearch';
import { RosterSection } from './RosterSection';
import { FileContactControl } from './FileContactControl';

/** Referentially stable, so filtering a section out does not churn its props. */
const EMPTY_NODES: NetworkNode[] = [];
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
  const [sortMode, setSortMode] = useState<SortMode>(DEFAULT_SORT);
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [query, setQuery] = useState('');

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

  // Inner Circle zone: search
  const displayedInnerCircle = sortNodes(filterNodes(innerCircleNodes, query), sortMode);

  // Every grid reserves its own rows; without it a section of bare names
  // renders three blank lines under each card.
  const sortedStarred = sortNodes(starredNodes, sortMode);
  const clientFacts = rowFactsFor(displayedInnerCircle);

  // Only categories with something in them, in page order.
  const categoryOptions = ([
    { id: 'roster', label: labels.roster, count: crewNodes.length },
    { id: 'clients', label: labels.clients, count: innerCircleNodes.length },
    { id: 'vendors', label: labels.vendors, count: vendorNodes.length },
    { id: 'venues', label: labels.venues, count: venueNodes.length },
    { id: 'unsorted', label: 'Unsorted', count: unsortedNodes.length },
  ] as const).filter((o) => o.count > 0).map((o) => ({ ...o }));

  /** A section renders when nothing is filtered, or when it is the one asked for. */
  const shows = (id: CategoryFilter) => category === 'all' || category === id;

  return (
    <div className={cn('relative flex w-full flex-col gap-8', showGenesis && 'flex-1 min-h-0')}>

      {/*
        Navigation first, then the controls that act on what it chose. Every
        system surveyed orders it this way -- Polaris, SAP, Salesforce, Carbon
        all put the scope switcher above the search, nearest the page title,
        because it decides what the rest of the page even is.
      */}
      {!showGenesis && (
        <div className="flex flex-col gap-4">
          <CategoryTabs value={category} onChange={setCategory} options={categoryOptions} />
          <div className="flex flex-wrap items-center justify-between gap-3">
            <ContactSearch
              value={query}
              onChange={setQuery}
              scopeLabel={categoryOptions.find((o) => o.id === category)?.label ?? null}
            />
            <SortControl value={sortMode} onChange={setSortMode} />
          </div>
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
      {shows('roster') && (
        <RosterSection
          nodes={crewNodes}
          query={query}
          label={labels.roster}
          sortMode={sortMode}
          onNodeClick={onNodeClick}
          onAffiliateClick={openAffiliate}
          onNodeHoverEnter={handleNodeHoverEnter}
          onNodeHoverLeave={handleNodeHoverLeave}
        />
      )}

      {/* ── Clients — anyone on a CLIENT edge, person or company ── */}
      {displayedInnerCircle.length > 0 && shows('clients') && (
        <>
          <section>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="flex items-center gap-2 stage-label text-[var(--stage-text-secondary)]">
                {labels.clients}
                <span className="shrink-0 rounded-full bg-[oklch(1_0_0/0.06)] px-2.5 py-0.5 stage-badge-text tabular-nums">
                  {displayedInnerCircle.length === innerCircleNodes.length
                    ? innerCircleNodes.length
                    : `${displayedInnerCircle.length} of ${innerCircleNodes.length}`}
                </span>
              </h2>
            </div>
            <div className="flex flex-col divide-y divide-[var(--stage-edge-subtle)] pb-2">
              {displayedInnerCircle.map((node) => (
                <div
                  key={node.id}
                  onMouseEnter={() => handleNodeHoverEnter(node)}
                  onMouseLeave={handleNodeHoverLeave}
                >
                  <NetworkRow
                    node={node}
                    facts={clientFacts}
                    onClick={() => onNodeClick?.(node)}
                    onAffiliateClick={openAffiliate}
                    onChanged={() => router.refresh()}
                  />
                </div>
              ))}
            </div>
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
              nodes={shows('vendors') ? vendorNodes : EMPTY_NODES}
              roleLabels={roleLabels}
              onNodeClick={onNodeClick}
              onAffiliateClick={openAffiliate}
              onNodeHoverEnter={handleNodeHoverEnter}
              onNodeHoverLeave={handleNodeHoverLeave}
              onTogglePreferred={onToggleStar ? handleToggleStar : undefined}
              sortMode={sortMode}
              query={query}
              onClearQuery={() => setQuery('')}
              onRowChanged={() => router.refresh()}
            />
            <CategorySection
              title={labels.venues}
              nodes={shows('venues') ? venueNodes : EMPTY_NODES}
              roleLabels={roleLabels}
              onNodeClick={onNodeClick}
              onAffiliateClick={openAffiliate}
              onNodeHoverEnter={handleNodeHoverEnter}
              onNodeHoverLeave={handleNodeHoverLeave}
              onTogglePreferred={onToggleStar ? handleToggleStar : undefined}
              sortMode={sortMode}
              query={query}
              onClearQuery={() => setQuery('')}
              onRowChanged={() => router.refresh()}
              /* Rooms, not faces. A venue's deciding fact is where it is, an
                 avatar tile says nothing about it, and there are more of them
                 than of anyone else -- so this is the clearest case in the
                 directory for a row over a card. */
              layout="rows"
            />
            <CategorySection
              layout="rows"
              title="Unsorted"
              nodes={shows('unsorted') ? unsortedNodes : EMPTY_NODES}
              emptyLabel="Nothing waiting to be filed."
              // A lane needs a way out, or it only grows.
              renderRowAction={(node) => <FileContactControl node={node} />}
              onNodeClick={onNodeClick}
              onAffiliateClick={openAffiliate}
              onNodeHoverEnter={handleNodeHoverEnter}
              onNodeHoverLeave={handleNodeHoverLeave}
              onTogglePreferred={onToggleStar ? handleToggleStar : undefined}
              sortMode={sortMode}
              query={query}
              onClearQuery={() => setQuery('')}
              onRowChanged={() => router.refresh()}
            />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
