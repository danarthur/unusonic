'use client';

import { useState, useTransition, useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, ArrowUpDown } from 'lucide-react';
import { NetworkCard } from '@/entities/network';
import { GenesisState } from './GenesisState';
import { TheMembrane } from './TheMembrane';
import { cn } from '@/shared/lib/utils';
import type { NetworkNode } from '@/entities/network';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

type FilterId = 'all' | 'clients' | 'vendors' | 'venues' | 'partners' | 'preferred';
type SortId = 'relationship' | 'name';

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

function getPartnerCounts(nodes: NetworkNode[]): Record<FilterId, number> {
  return {
    all: nodes.length,
    clients:  nodes.filter((n) => n.identity.label === 'Client').length,
    vendors:  nodes.filter((n) => n.identity.label === 'Vendor').length,
    venues:   nodes.filter((n) => n.identity.label === 'Venue').length,
    partners: nodes.filter((n) => !['Client', 'Vendor', 'Venue'].includes(n.identity.label ?? '')).length,
    preferred: nodes.filter((n) => n.gravity === 'inner_circle').length,
  };
}

function applyFilter(nodes: NetworkNode[], filter: FilterId): NetworkNode[] {
  switch (filter) {
    case 'clients':   return nodes.filter((n) => n.identity.label === 'Client');
    case 'vendors':   return nodes.filter((n) => n.identity.label === 'Vendor');
    case 'venues':    return nodes.filter((n) => n.identity.label === 'Venue');
    case 'partners':  return nodes.filter((n) => !['Client', 'Vendor', 'Venue'].includes(n.identity.label ?? ''));
    case 'preferred': return nodes.filter((n) => n.gravity === 'inner_circle');
    default:          return nodes;
  }
}

function applySort(nodes: NetworkNode[], sort: SortId): NetworkNode[] {
  const gravityOrder: Record<string, number> = { inner_circle: 0, outer_orbit: 1 };
  if (sort === 'name') {
    return [...nodes].sort((a, b) => a.identity.name.localeCompare(b.identity.name));
  }
  return [...nodes].sort((a, b) => {
    const ga = gravityOrder[a.gravity] ?? 2;
    const gb = gravityOrder[b.gravity] ?? 2;
    if (ga !== gb) return ga - gb;
    return a.identity.name.localeCompare(b.identity.name);
  });
}

const FILTER_DEFS: { id: FilterId; label: string }[] = [
  { id: 'all',       label: 'All' },
  { id: 'clients',   label: 'Clients' },
  { id: 'vendors',   label: 'Vendors' },
  { id: 'venues',    label: 'Venues' },
  { id: 'partners',  label: 'Partners' },
  { id: 'preferred', label: 'Preferred' },
];

type OptimisticAction =
  | { type: 'remove'; id: string }
  | { type: 'toggle_preferred'; id: string; newGravity: 'inner_circle' | 'outer_orbit' };

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
  const [search, setSearch] = useState('');

  const allPartnerNodes = nodes.filter((n) => n.kind === 'external_partner');

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

  const coreNodes = optimisticNodes.filter((n) => n.kind === 'internal_employee');
  const extendedTeamNodes = optimisticNodes.filter((n) => n.kind === 'extended_team');
  const partnerNodes = optimisticNodes.filter((n) => n.kind === 'external_partner');

  const showGenesis = allPartnerNodes.length === 0;

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

  // Counts, filter, search, sort — applied to partner nodes only
  const counts = getPartnerCounts(partnerNodes);
  const visibleFilters = FILTER_DEFS.filter((f) => f.id === 'all' || counts[f.id] > 0);

  let displayed = applyFilter(partnerNodes, activeFilter);
  if (search.trim()) {
    const q = search.toLowerCase();
    displayed = displayed.filter(
      (n) =>
        n.identity.name.toLowerCase().includes(q) ||
        (n.identity.label ?? '').toLowerCase().includes(q) ||
        (n.meta.tags ?? []).some((t) => t.toLowerCase().includes(q))
    );
  }
  displayed = applySort(displayed, sort);

  const hasRosterNodes = coreNodes.length > 0 || extendedTeamNodes.length > 0;

  return (
    <div className={cn('relative flex w-full flex-col gap-8', showGenesis && !hasRosterNodes && 'flex-1 min-h-0')}>

      {/* ── Zone 1: Core Team (W2 / internal employees) ── */}
      {coreNodes.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-medium tracking-wide text-[var(--color-ink-muted)]">
            Core
          </h2>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 auto-rows-[84px]">
            {coreNodes.map((node, index) => (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: index * 0.04 }}
                className="h-full"
              >
                <NetworkCard
                  node={node}
                  layoutId={`node-${node.id}`}
                  onClick={() => onNodeClick?.(node)}
                />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── Membrane between Core and Extended Team ── */}
      {coreNodes.length > 0 && extendedTeamNodes.length > 0 && (
        <TheMembrane label="Extended Team & Talent" />
      )}

      {/* ── Zone 2: Extended Team & Talent (1099 / contractors) ── */}
      {extendedTeamNodes.length > 0 && (
        <section>
          {coreNodes.length === 0 && (
            <h2 className="mb-3 text-sm font-medium tracking-wide text-[var(--color-ink-muted)]">
              Extended Team & Talent
            </h2>
          )}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 auto-rows-[84px]">
            {extendedTeamNodes.map((node, index) => (
              <motion.div
                key={node.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ ...spring, delay: index * 0.04 }}
                className="h-full"
              >
                <NetworkCard
                  node={node}
                  layoutId={`node-${node.id}`}
                  onClick={() => onNodeClick?.(node)}
                />
              </motion.div>
            ))}
          </div>
        </section>
      )}

      {/* ── Zone 3: Network (external partners) or Genesis ── */}
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
            key="stream"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="flex flex-col gap-5"
          >
            {hasRosterNodes && <TheMembrane label="Network" />}

            {/* Filter + Sort bar */}
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex flex-wrap gap-1.5">
                {visibleFilters.map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setActiveFilter(f.id)}
                    className={cn(
                      'flex items-center gap-1.5 rounded-xl px-3 py-1.5 text-xs font-medium transition-all duration-150',
                      activeFilter === f.id
                        ? 'bg-[var(--color-silk)]/15 text-[var(--color-silk)] shadow-[inset_0_0_0_1px_var(--color-silk)/30]'
                        : 'bg-[oklch(1_0_0/0.05)] text-[var(--color-ink-muted)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--color-ink)]'
                    )}
                  >
                    {f.label}
                    {f.id !== 'all' && (
                      <span
                        className={cn(
                          'rounded-full px-1.5 py-px text-[10px] tabular-nums leading-4',
                          activeFilter === f.id
                            ? 'bg-[var(--color-silk)]/20 text-[var(--color-silk)]'
                            : 'bg-[oklch(1_0_0/0.08)] text-[var(--color-ink-muted)]'
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
                  <Search className="absolute left-2.5 top-1/2 size-3 -translate-y-1/2 text-[var(--color-ink-muted)]/60 pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Filter…"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    className={cn(
                      'h-8 rounded-xl border border-[var(--color-mercury)] bg-[oklch(1_0_0/0.05)]',
                      'pl-7 pr-3 text-xs text-[var(--color-ink)] placeholder:text-[var(--color-ink-muted)]/50',
                      'outline-none transition-all duration-200',
                      'focus:border-[var(--color-silk)]/40 focus:bg-[oklch(1_0_0/0.07)]',
                      search ? 'w-40' : 'w-28 focus:w-40'
                    )}
                  />
                </div>

                {/* Sort toggle */}
                <button
                  type="button"
                  onClick={() => setSort((s) => (s === 'relationship' ? 'name' : 'relationship'))}
                  title={sort === 'relationship' ? 'Sorted: preferred first' : 'Sorted: A–Z'}
                  className="flex h-8 items-center gap-1.5 rounded-xl border border-[var(--color-mercury)] bg-[oklch(1_0_0/0.05)] px-2.5 text-xs text-[var(--color-ink-muted)] transition-colors hover:border-[var(--color-silk)]/30 hover:text-[var(--color-ink)]"
                >
                  <ArrowUpDown className="size-3" />
                  {sort === 'relationship' ? 'Preferred' : 'A–Z'}
                </button>
              </div>
            </div>

            {/* Unified partner grid */}
            <AnimatePresence mode="popLayout">
              {displayed.length > 0 ? (
                <motion.div
                  key="grid"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[124px]"
                >
                  {displayed.map((node, index) => (
                    <motion.div
                      key={node.id}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      transition={{ ...spring, delay: Math.min(index * 0.03, 0.18) }}
                      className="h-full"
                    >
                      <NetworkCard
                        node={node}
                        layoutId={`node-${node.id}`}
                        onClick={() => onNodeClick?.(node)}
                        onTogglePreferred={(onPin || onUnpin) ? () => handleTogglePreferred(node) : undefined}
                      />
                    </motion.div>
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
                  <p className="text-sm text-[var(--color-ink-muted)]">
                    {search ? (
                      <>No results for <span className="text-[var(--color-ink)]">"{search}"</span></>
                    ) : (
                      'Nothing here yet.'
                    )}
                  </p>
                  {search && (
                    <button
                      type="button"
                      onClick={() => setSearch('')}
                      className="mt-2 text-xs text-[var(--color-silk)] hover:underline"
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
    </div>
  );
}
