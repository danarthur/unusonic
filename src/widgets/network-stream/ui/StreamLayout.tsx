'use client';

import { useState, useTransition, useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpDown, ChevronDown } from 'lucide-react';
import { NetworkCard } from '@/entities/network';
import { GenesisState } from './GenesisState';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import type { NetworkNode } from '@/entities/network';

// =============================================================================
// Helpers: classify nodes into zones using existing kind/gravity/entityType
// =============================================================================

/** A node belongs to the Crew zone if it is roster (staff/contractor) OR a preferred freelancer person. */
function isCrewNode(n: NetworkNode): boolean {
  if (n.kind === 'internal_employee' || n.kind === 'extended_team') return true;
  // Preferred freelancer person — PARTNER edge with tier=preferred and entity type person
  if (n.kind === 'external_partner' && n.gravity === 'inner_circle' && n.identity.entityType === 'person') return true;
  return false;
}

/** A node belongs to the Inner Circle zone if it is a preferred company/venue (not person). */
function isInnerCircleNode(n: NetworkNode): boolean {
  return n.kind === 'external_partner' && n.gravity === 'inner_circle' && n.identity.entityType !== 'person';
}

/** Everything else is Network. */
function isNetworkNode(n: NetworkNode): boolean {
  return !isCrewNode(n) && !isInnerCircleNode(n);
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
// Network zone: filters and sorting
// =============================================================================

type FilterId = 'all' | 'clients' | 'vendors' | 'venues' | 'partners';
type SortId = 'relationship' | 'name';

function getNetworkCounts(nodes: NetworkNode[]): Record<FilterId, number> {
  return {
    all: nodes.length,
    clients:  nodes.filter((n) => n.identity.label === 'Client').length,
    vendors:  nodes.filter((n) => n.identity.label === 'Vendor').length,
    venues:   nodes.filter((n) => n.identity.label === 'Venue').length,
    partners: nodes.filter((n) => !['Client', 'Vendor', 'Venue'].includes(n.identity.label ?? '')).length,
  };
}

function applyFilter(nodes: NetworkNode[], filter: FilterId): NetworkNode[] {
  switch (filter) {
    case 'clients':   return nodes.filter((n) => n.identity.label === 'Client');
    case 'vendors':   return nodes.filter((n) => n.identity.label === 'Vendor');
    case 'venues':    return nodes.filter((n) => n.identity.label === 'Venue');
    case 'partners':  return nodes.filter((n) => !['Client', 'Vendor', 'Venue'].includes(n.identity.label ?? ''));
    default:          return nodes;
  }
}

function applySort(nodes: NetworkNode[], sort: SortId): NetworkNode[] {
  return [...nodes].sort((a, b) => a.identity.name.localeCompare(b.identity.name));
}

const FILTER_DEFS: { id: FilterId; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'clients',   label: 'Clients' },
  { id: 'vendors',   label: 'Vendors' },
  { id: 'venues',    label: 'Venues' },
  { id: 'partners',  label: 'Partners' },
];

// =============================================================================
// Optimistic updates
// =============================================================================

type OptimisticAction =
  | { type: 'remove'; id: string }
  | { type: 'toggle_preferred'; id: string; newGravity: 'inner_circle' | 'outer_orbit' };

// =============================================================================
// Component
// =============================================================================

interface StreamLayoutProps {
  nodes: NetworkNode[];
  onNodeClick?: (node: NetworkNode) => void;
  onUnpin?: (relationshipId: string) => Promise<{ ok: boolean; error?: string }>;
  onPin?: (relationshipId: string) => Promise<{ ok: boolean; error?: string }>;
  hasIdentity?: boolean;
  hasTeam?: boolean;
  brandColor?: string | null;
  onOpenOmni?: () => void;
  onOpenProfile?: () => void;
}

export function StreamLayout({
  nodes,
  onNodeClick,
  onUnpin,
  onPin,
  hasIdentity = false,
  hasTeam = false,
  brandColor = null,
  onOpenOmni,
  onOpenProfile,
}: StreamLayoutProps) {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const [sort, setSort] = useState<SortId>('relationship');
  const [crewSearch, setCrewSearch] = useState('');
  const [innerCircleSearch, setInnerCircleSearch] = useState('');
  const [networkSearch, setNetworkSearch] = useState('');
  const [crewExpanded, setCrewExpanded] = useState(true);
  const [innerCircleExpanded, setInnerCircleExpanded] = useState(true);
  const [networkExpanded, setNetworkExpanded] = useState(false);
  const [activeRoleFilter, setActiveRoleFilter] = useState<string | null>(null);

  const [optimisticNodes, dispatchOptimistic] = useOptimistic(
    nodes,
    (current: NetworkNode[], action: OptimisticAction) => {
      if (action.type === 'remove') return current.filter((n) => n.id !== action.id);
      if (action.type === 'toggle_preferred') {
        return current.map((n) =>
          n.id === action.id ? { ...n, gravity: action.newGravity as NetworkNode['gravity'] } : n
        );
      }
      return current;
    }
  );

  // Classify into zones
  const crewNodes = optimisticNodes.filter(isCrewNode);
  const innerCircleNodes = optimisticNodes.filter(isInnerCircleNode);
  const networkNodes = optimisticNodes.filter(isNetworkNode);

  const showGenesis = crewNodes.length === 0 && innerCircleNodes.length === 0 && networkNodes.length === 0;

  const handleTogglePreferred = (node: NetworkNode) => {
    const isCurrentlyPreferred = node.gravity === 'inner_circle';
    const action = isCurrentlyPreferred ? onUnpin : onPin;
    if (!action) return;
    const newGravity = isCurrentlyPreferred ? 'outer_orbit' : 'inner_circle';
    startTransition(async () => {
      dispatchOptimistic({ type: 'toggle_preferred', id: node.id, newGravity });
      const result = await action(node.id);
      if (result.ok) router.refresh();
    });
  };

  // Shared search filter
  function searchFilter(nodes: NetworkNode[], query: string): NetworkNode[] {
    if (!query.trim()) return nodes;
    const q = query.toLowerCase();
    return nodes.filter(
      (n) =>
        n.identity.name.toLowerCase().includes(q) ||
        (n.identity.label ?? '').toLowerCase().includes(q) ||
        (n.meta.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }

  // Crew zone: search, role grouping and filtering
  const searchedCrewNodes = searchFilter(crewNodes, crewSearch);
  const roleGroups = groupByRole(searchedCrewNodes);
  const allRoleKeys = [...groupByRole(crewNodes).keys()]; // Use unfiltered for pill labels
  const filteredCrewNodes = activeRoleFilter
    ? searchedCrewNodes.filter((n) => (n.roleGroup || 'Other') === activeRoleFilter)
    : searchedCrewNodes;
  const filteredRoleGroups = activeRoleFilter
    ? new Map([[activeRoleFilter, filteredCrewNodes]])
    : roleGroups;

  // Inner Circle zone: search
  const displayedInnerCircle = searchFilter(innerCircleNodes, innerCircleSearch);

  // Network zone: filter, search, sort
  const counts = getNetworkCounts(networkNodes);
  const visibleFilters = FILTER_DEFS.filter((f) => f.id === 'all' || counts[f.id] > 0);

  let displayedNetwork = applyFilter(networkNodes, activeFilter);
  displayedNetwork = searchFilter(displayedNetwork, networkSearch);
  displayedNetwork = applySort(displayedNetwork, sort);

  return (
    <div className={cn('relative flex w-full flex-col gap-8', showGenesis && 'flex-1 min-h-0')}>

      {/* ── Zone 1: Crew (Staff + Contractors + Freelancers) ── */}
      {crewNodes.length > 0 && (
        <section>
          <div className="mb-3 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={() => setCrewExpanded((v) => !v)}
              className="flex items-center gap-2 text-left group"
            >
              <h2 className="stage-label text-[var(--stage-text-secondary)]">
                Crew
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
                            <div key={node.id} className="h-full">
                              <NetworkCard
                                node={node}
                                layoutId={`node-${node.id}`}
                                onClick={() => onNodeClick?.(node)}
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

      {/* ── Zone 2: Inner Circle (preferred companies + venues) ── */}
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
                  Inner Circle
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
                    <div className="grid grid-cols-1 gap-[var(--stage-gap)] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
                      {displayedInnerCircle.map((node) => (
                        <div key={node.id} className="h-full">
                          <NetworkCard
                            node={node}
                            layoutId={`node-${node.id}`}
                            onClick={() => onNodeClick?.(node)}
                            onTogglePreferred={(onPin || onUnpin) ? () => handleTogglePreferred(node) : undefined}
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

      {/* ── Zone 3: Network (everyone else) or Genesis ── */}
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
        ) : networkNodes.length > 0 ? (
          <motion.div
            key="network-stream"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={STAGE_MEDIUM}
            className="flex flex-col gap-5"
          >
            {/* Collapsible header */}
            {(crewNodes.length > 0 || innerCircleNodes.length > 0) && (
              <button
                type="button"
                onClick={() => setNetworkExpanded((v) => !v)}
                className="flex items-center gap-2 text-left group"
              >
                <h2 className="stage-label text-[var(--stage-text-secondary)]">
                  Network
                </h2>
                <span className="shrink-0 rounded-full bg-[oklch(1_0_0/0.06)] px-2.5 py-0.5 stage-badge-text tabular-nums text-[var(--stage-text-secondary)]">
                  {networkNodes.length}
                </span>
                <ChevronDown
                  className={cn(
                    'size-3.5 text-[var(--stage-text-secondary)] transition-transform duration-[120ms]',
                    networkExpanded && 'rotate-180'
                  )}
                />
              </button>
            )}

            {/* Content — shown when expanded (or when no crew/inner circle exist) */}
            <AnimatePresence>
              {(networkExpanded || (crewNodes.length === 0 && innerCircleNodes.length === 0)) && (
                <motion.div
                  key="network-content"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={STAGE_MEDIUM}
                  className="flex flex-col gap-5 overflow-hidden"
                >
                  {/* Filter + Sort bar */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex flex-wrap gap-1.5">
                      {visibleFilters.map((f) => (
                        <button
                          key={f.id}
                          type="button"
                          onClick={() => setActiveFilter(f.id)}
                          className={cn(
                            'flex items-center gap-1.5 rounded-xl px-3 py-1.5 stage-badge-text transition-colors duration-100',
                            activeFilter === f.id
                              ? 'bg-[var(--stage-accent)]/15 text-[var(--stage-accent)] shadow-[inset_0_0_0_1px_var(--stage-accent)/30]'
                              : 'bg-[oklch(1_0_0/0.05)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]'
                          )}
                        >
                          {f.label}
                          {f.id !== 'all' && (
                            <span
                              className={cn(
                                'rounded-full px-1.5 py-px stage-badge-text tabular-nums',
                                activeFilter === f.id
                                  ? 'bg-[var(--stage-accent)]/20 text-[var(--stage-accent)]'
                                  : 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-secondary)]'
                              )}
                            >
                              {counts[f.id]}
                            </span>
                          )}
                        </button>
                      ))}
                    </div>

                    <div className="ml-auto flex items-center gap-2">
                      {/* Search */}
                      <div className="relative">
                        <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--stage-text-secondary)]/60 pointer-events-none" />
                        <input
                          type="text"
                          placeholder="Filter…"
                          aria-label="Search network"
                          value={networkSearch}
                          onChange={(e) => setNetworkSearch(e.target.value)}
                          className={cn(
                            'stage-input h-8 !pl-7 pr-3 text-xs',
                            'focus-visible:outline-none',
                            networkSearch ? 'w-40' : 'w-28 focus:w-40'
                          )}
                        />
                      </div>

                      {/* Sort toggle */}
                      <button
                        type="button"
                        onClick={() => setSort((s) => (s === 'relationship' ? 'name' : 'relationship'))}
                        title={sort === 'relationship' ? 'Sorted: default' : 'Sorted: A–Z'}
                        className="flex h-8 items-center gap-1.5 rounded-xl border border-[var(--stage-edge-subtle)] bg-[oklch(1_0_0/0.05)] px-2.5 stage-badge-text text-[var(--stage-text-secondary)] transition-colors hover:border-[var(--stage-accent)]/30 hover:text-[var(--stage-text-primary)]"
                      >
                        <ArrowUpDown className="size-3" />
                        {sort === 'relationship' ? 'Default' : 'A–Z'}
                      </button>
                    </div>
                  </div>

                  {/* Network grid */}
                  <AnimatePresence mode="popLayout">
                    {displayedNetwork.length > 0 ? (
                      <motion.div
                        key="grid"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="grid grid-cols-1 gap-[var(--stage-gap)] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                      >
                        {displayedNetwork.map((node) => (
                          <div key={node.id} className="h-full">
                            <NetworkCard
                              node={node}
                              layoutId={`node-${node.id}`}
                              onClick={() => onNodeClick?.(node)}
                              onTogglePreferred={(onPin || onUnpin) ? () => handleTogglePreferred(node) : undefined}
                            />
                          </div>
                        ))}
                      </motion.div>
                    ) : (
                      <motion.div
                        key="empty"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        className="flex flex-col items-center justify-center py-16 text-center"
                      >
                        <p className="stage-label text-[var(--stage-text-secondary)]">
                          {networkSearch ? (
                            <>No results for <span className="text-[var(--stage-text-primary)]">&ldquo;{networkSearch}&rdquo;</span></>
                          ) : (
                            'No connections yet.'
                          )}
                        </p>
                        {networkSearch && (
                          <button
                            type="button"
                            onClick={() => setNetworkSearch('')}
                            className="mt-2 stage-badge-text text-[var(--stage-accent)] hover:underline"
                          >
                            Clear filter
                          </button>
                        )}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        ) : null}
      </AnimatePresence>
    </div>
  );
}
