'use client';

/**
 * The starred strip: this user's own shortcuts, above everything else.
 *
 * Lifted out of StreamLayout, which was 566 lines with a 411-line function and
 * is the page's main structural problem -- two of its five sections are
 * hand-rolled while three share a component.
 *
 * @module widgets/network-stream/ui/StarredStrip
 */

import { Star } from 'lucide-react';
import { NetworkCard } from '@/entities/network';
import { reservedSlotCount } from '@/entities/network/model/card-slots';
import type { NetworkNode } from '@/entities/network';

export interface StarredStripProps {
  nodes: NetworkNode[];
  onNodeClick?: (node: NetworkNode) => void;
  onAffiliateClick?: (entityId: string) => void;
  onNodeHoverEnter?: (node: NetworkNode) => void;
  onNodeHoverLeave?: () => void;
  onToggleStar?: (node: NetworkNode) => void;
}

export function StarredStrip({
  nodes,
  onNodeClick,
  onAffiliateClick,
  onNodeHoverEnter,
  onNodeHoverLeave,
  onToggleStar,
}: StarredStripProps) {
  if (nodes.length === 0) return null;

  const slotCount = reservedSlotCount(nodes);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center gap-2">
        <Star size={12} strokeWidth={1.5} className="text-[var(--stage-text-secondary)]" />
        <h2 className="stage-label text-[var(--stage-text-secondary)]">Starred</h2>
        <span className="shrink-0 rounded-full bg-[oklch(1_0_0_/_0.06)] px-2.5 py-0.5 stage-badge-text tabular-nums text-[var(--stage-text-secondary)]">
          {nodes.length}
        </span>
      </div>
      <div className="grid grid-cols-1 gap-[var(--stage-gap)] sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
        {nodes.map((node) => (
          <div
            key={`starred-${node.id}`}
            className="h-full"
            onMouseEnter={() => onNodeHoverEnter?.(node)}
            onMouseLeave={onNodeHoverLeave}
          >
            {/* No layoutId here on purpose: this node also renders in its
                category below, and two elements sharing a layoutId make
                Framer Motion animate between them. */}
            <NetworkCard
              node={node}
              slotCount={slotCount}
              onClick={() => onNodeClick?.(node)}
              onAffiliateClick={onAffiliateClick}
              onTogglePreferred={onToggleStar ? () => onToggleStar(node) : undefined}
            />
          </div>
        ))}
      </div>
    </div>
  );
}
