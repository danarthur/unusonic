'use client';

import { useTransition, useOptimistic } from 'react';
import { useRouter } from 'next/navigation';
import { motion, AnimatePresence } from 'framer-motion';
import { NetworkCard } from '@/entities/network';
import { TheMembrane } from './TheMembrane';
import { GenesisState } from './GenesisState';
import type { NetworkNode } from '@/entities/network';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

interface StreamLayoutProps {
  nodes: NetworkNode[];
  onNodeClick?: (node: NetworkNode) => void;
  onUnpin?: (relationshipId: string) => Promise<{ ok: boolean; error?: string }>;
  hasIdentity?: boolean;
  /** When true, Genesis Card 2 (Assemble Core) is complete; Card 3 (Connection) is the active target. */
  hasTeam?: boolean;
  brandColor?: string | null;
  onOpenOmni?: () => void;
  onOpenProfile?: () => void;
}

export function StreamLayout({ nodes, onNodeClick, onUnpin, hasIdentity = false, hasTeam = false, brandColor = null, onOpenOmni, onOpenProfile }: StreamLayoutProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const coreNodes = nodes.filter((n) => n.kind === 'internal_employee');
  const partnerNodes = nodes.filter((n) => n.kind === 'external_partner');
  const [optimisticPartners, setOptimisticPartners] = useOptimistic(
    partnerNodes,
    (current, relationshipId: string) => current.filter((n) => n.id !== relationshipId)
  );
  /** Show Genesis (3-card setup) until at least one external connection exists. Then show the living stream. */
  const showGenesis = partnerNodes.length === 0;

  const handleUnpin = (relationshipId: string) => {
    if (!onUnpin) return;
    startTransition(async () => {
      setOptimisticPartners(relationshipId);
      const result = await onUnpin(relationshipId);
      if (result.ok) {
        router.refresh();
      }
      /* On error, useOptimistic reverts when transition completes (real state unchanged) */
    });
  };

  return (
    <div className={`relative flex flex-col gap-8 ${showGenesis ? 'flex-1 min-h-0' : ''}`}>
      <AnimatePresence mode="wait">
        {showGenesis ? (
          <GenesisState key="genesis" hasIdentity={hasIdentity} hasTeam={hasTeam} brandColor={brandColor} onOpenOmni={onOpenOmni} onOpenProfile={onOpenProfile} />
        ) : (
          <motion.div
            key="stream"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={spring}
            className="flex flex-col gap-8"
          >
            {/* Zone A: The Core (Internal Employees) */}
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-wide text-[var(--color-ink-muted)]">
                Core
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 auto-rows-[minmax(140px,auto)]">
                {coreNodes.map((node, index) => (
                  <motion.div
                    key={node.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: index * 0.05 }}
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

            <TheMembrane />

            {/* Zone B: Inner Circle (Preferred Partners) — Bento: first partner = Hero cell */}
            <section>
              <h2 className="mb-3 text-sm font-medium tracking-wide text-[var(--color-ink-muted)]">
                Inner Circle
              </h2>
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4 auto-rows-[minmax(140px,auto)]">
                {optimisticPartners.map((node, index) => (
                  <motion.div
                    key={node.id}
                    layout
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ ...spring, delay: index * 0.05 }}
                    className={index === 0 ? 'sm:col-span-2 sm:row-span-2 min-h-[200px]' : ''}
                  >
                    <NetworkCard
                      node={node}
                      layoutId={`node-${node.id}`}
                      onClick={() => onNodeClick?.(node)}
                      onUnpin={onUnpin ? handleUnpin : undefined}
                      hero={index === 0}
                    />
                  </motion.div>
                ))}
              </div>
            </section>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
