'use client';

import { useRouter } from 'next/navigation';
import { Building2, CheckCircle, Network, Users } from 'lucide-react';
import { motion } from 'framer-motion';
import { cn } from '@/shared/lib/utils';
import { HoloCard } from './HoloCard';
import type { GenesisReaction } from './GenesisState';

const spring = { type: 'spring' as const, stiffness: 300, damping: 30 };

export interface GenesisGridProps {
  reaction?: GenesisReaction | undefined;
  hasIdentity?: boolean;
  /** When true, Team (Card 2) is complete and Card 3 (Connection) becomes the active target. */
  hasTeam?: boolean;
  /** Org brand color for completed Identity card (solid). */
  brandColor?: string | null;
  onOpenProfile?: () => void;
  onOpenOmni?: () => void;
  onReactionChange?: (reaction: GenesisReaction | undefined) => void;
}

/**
 * Genesis path: 1 Establish Identity → 2 Assemble Core → 3 Integrate Connection.
 */
export function GenesisGrid({ reaction, hasIdentity = false, hasTeam = false, brandColor = null, onOpenProfile, onOpenOmni, onReactionChange }: GenesisGridProps) {
  const router = useRouter();
  const airlockActive = hasIdentity && hasTeam;
  /** Same completed look for step 1 and step 2: brand when available, else success. */
  const completedAccent = brandColor?.trim() ?? undefined;

  return (
    <motion.div
      className="grid w-full gap-5 md:gap-6 auto-rows-fr grid-cols-1 sm:grid-cols-2 md:grid-cols-3"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={spring}
    >
      {/* Card 1: Establish Identity – slightly dimmed when Airlock active but still hoverable/editable */}
      <motion.div
        className={cn('min-h-0 transition-opacity', airlockActive && 'opacity-70')}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.05 }}
        onMouseEnter={() => onReactionChange?.(hasIdentity ? 'focus' : 'focus')}
        onMouseLeave={() => onReactionChange?.(undefined)}
      >
        <HoloCard
          className="h-full"
          step={1}
          title="Set identity"
          description={hasIdentity ? 'Done.' : 'Set your brand and core details.'}
          icon={hasIdentity ? CheckCircle : Building2}
          highlight={reaction === 'focus'}
          completed={hasIdentity}
          completedColor={hasIdentity ? completedAccent : undefined}
          onClick={() => onOpenProfile?.()}
        />
      </motion.div>

      {/* Card 2: Assemble Core – slightly dimmed when Airlock active but still hoverable/editable */}
      <motion.div
        className={cn('min-h-0 transition-opacity', airlockActive && 'opacity-70')}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.1 }}
        onMouseEnter={() => onReactionChange?.('pulse')}
        onMouseLeave={() => onReactionChange?.(undefined)}
      >
        <HoloCard
          className="h-full"
          step={2}
          title="Add team"
          description={hasTeam ? 'Done.' : 'Add your team members.'}
          icon={hasTeam ? CheckCircle : Users}
          pulse={!hasTeam}
          highlight={reaction === 'pulse'}
          completed={hasTeam}
          completedColor={hasTeam ? completedAccent : undefined}
          onClick={() => router.push('/settings/team')}
        />
      </motion.div>

      {/* Card 3: Integrate Connection – same size as 1 & 2; ring when airlock active */}
      <motion.div
        className={cn(
          'min-h-0',
          airlockActive && 'ring-2 ring-[var(--color-silk)]/50 ring-offset-2 ring-offset-[var(--color-canvas)] rounded-3xl shadow-[0_0_30px_-5px_var(--color-silk)]'
        )}
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ ...spring, delay: 0.15 }}
        onMouseEnter={() => onReactionChange?.('mass')}
        onMouseLeave={() => onReactionChange?.(undefined)}
      >
        <HoloCard
          className="h-full"
          step={3}
          variant="primary"
          title="Add partners"
          description="Add vendors and clients."
          icon={Network}
          highlight={reaction === 'mass' || airlockActive}
          onClick={() => onOpenOmni?.()}
        />
      </motion.div>
    </motion.div>
  );
}
