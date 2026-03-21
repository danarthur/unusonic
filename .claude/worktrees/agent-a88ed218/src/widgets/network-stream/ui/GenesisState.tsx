'use client';

import * as React from 'react';
import { motion } from 'framer-motion';
import { GenesisCore } from './GenesisCore';
import { GenesisGrid } from './GenesisGrid';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export type GenesisReaction = 'focus' | 'pulse' | 'mass';

export interface GenesisStateProps {
  hasIdentity?: boolean;
  /** When true, Team (Card 2) is complete; Card 3 (Connection) becomes the active target. */
  hasTeam?: boolean;
  /** Org brand color for completed Identity card (solid border/icon). */
  brandColor?: string | null;
  onOpenOmni?: () => void;
  onOpenProfile?: () => void;
}

/**
 * Brand Sanctuary – Empty Network Orbit centered on the Living Logo.
 * Full-height container, radial gradient, Core (logo) + Satellite cards.
 * Card hover drives physics reactions (focus / pulse / mass), not loading state.
 */
export function GenesisState({ hasIdentity = false, hasTeam = false, brandColor = null, onOpenOmni, onOpenProfile }: GenesisStateProps) {
  const [reaction, setReaction] = React.useState<GenesisReaction | undefined>(undefined);

  /* Tight glow around center so it fades before header – no hard line */
  const gradientStyle = {
    background: `
      radial-gradient(
        circle at 50% 50%,
        oklch(0.70 0.15 250 / 0.10) 0%,
        oklch(0.70 0.15 250 / 0.04) 25%,
        transparent 45%
      )
    `,
  };

  return (
    <motion.div
      className="relative flex flex-1 w-full min-h-0 flex-col items-center justify-center py-12"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={spring}
    >
      {/* In-flow gradient (fixed layer is rendered by NetworkOrbitWithGenesis so it sits behind header) */}
      <div
        className="pointer-events-none absolute inset-0 z-0"
        aria-hidden
        style={gradientStyle}
      />
      <div className="relative z-10 flex flex-col items-center w-full">
        <GenesisCore reaction={reaction} />
        <div className="mt-8 w-full max-w-5xl px-5 sm:px-6 md:px-8">
          <h2 className="text-center text-2xl font-normal text-[var(--color-ink)] tracking-tight mb-8">
            Network Architecture
          </h2>
          <GenesisGrid
            reaction={reaction}
            hasIdentity={hasIdentity}
            hasTeam={hasTeam}
            brandColor={brandColor}
            onOpenOmni={onOpenOmni}
            onOpenProfile={onOpenProfile}
            onReactionChange={setReaction}
          />
        </div>
      </div>
    </motion.div>
  );
}
