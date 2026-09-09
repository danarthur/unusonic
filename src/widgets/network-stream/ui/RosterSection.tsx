'use client';

/**
 * The roster section: staff, contractors and the freelancers we book.
 *
 * Lifted out of StreamLayout, which had grown to 569 lines with a 399-line
 * function and was the page's real structural problem -- two of its five
 * sections were hand-rolled while three shared a component. This is the second
 * and last of the two.
 *
 * It owns its own search, expansion and role filter, because none of that state
 * was ever read anywhere else; keeping it here is what turns seventeen props
 * into six.
 *
 * @module widgets/network-stream/ui/RosterSection
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ChevronDown } from 'lucide-react';
import { NetworkCard } from '@/entities/network';
import type { NetworkNode } from '@/entities/network';
import { reservedSlotCount } from '@/entities/network/model/card-slots';
import { filterNodes } from '@/entities/network/model/search-node';
import { sortNodes, type SortMode } from '@/entities/network/model/sort-nodes';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { cn } from '@/shared/lib/utils';

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

export interface RosterSectionProps {
  nodes: NetworkNode[];
  label: string;
  sortMode: SortMode;
  onNodeClick?: (node: NetworkNode) => void;
  onAffiliateClick: (entityId: string) => void;
  onNodeHoverEnter: (node: NetworkNode) => void;
  onNodeHoverLeave: () => void;
}

export function RosterSection({
  nodes: crewNodes,
  label,
  sortMode,
  onNodeClick,
  onAffiliateClick: openAffiliate,
  onNodeHoverEnter: handleNodeHoverEnter,
  onNodeHoverLeave: handleNodeHoverLeave,
}: RosterSectionProps) {
  const [crewSearch, setCrewSearch] = useState('');
  const [crewExpanded, setCrewExpanded] = useState(true);
  const [activeRoleFilter, setActiveRoleFilter] = useState<string | null>(null);

  const searchedCrewNodes = sortNodes(filterNodes(crewNodes, crewSearch), sortMode);
  const roleGroups = groupByRole(searchedCrewNodes);
  // Unfiltered, so the pills keep their labels while a search is narrowing.
  const allRoleKeys = [...groupByRole(crewNodes).keys()];
  const filteredCrewNodes = activeRoleFilter
    ? searchedCrewNodes.filter((n) => (n.roleGroup || 'Other') === activeRoleFilter)
    : searchedCrewNodes;
  const filteredRoleGroups = activeRoleFilter
    ? new Map([[activeRoleFilter, filteredCrewNodes]])
    : roleGroups;

  if (crewNodes.length === 0) return null;

  return (
  <section>
    <div className="mb-3 flex items-center justify-between gap-3">
      <button
        type="button"
        onClick={() => setCrewExpanded((v) => !v)}
        className="flex items-center gap-2 text-left group"
      >
        <h2 className="stage-label text-[var(--stage-text-secondary)]">
          {label}
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
  );
}
