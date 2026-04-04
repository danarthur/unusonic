'use client';

import { motion } from 'framer-motion';
import { Plus, Crown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { getRoleLabel } from '../model/role-presets';
import { PORTAL_PROFILES } from '@/shared/lib/portal-profiles';
import type { RosterBadgeData, RosterBadgeStatus } from '../model/types';

export interface GhostBadgeProps {
  status: RosterBadgeStatus;
  data?: RosterBadgeData | null;
  onClick?: () => void;
  className?: string;
}

/**
 * Personnel card: empty (dashed + plus), captain (lit), ghost (clay), invited, or active.
 * When a photo is set (avatarUrl), the card highlights it with a larger avatar and clearer layout.
 */
export function GhostBadge({ status, data, onClick, className }: GhostBadgeProps) {
  const isEmpty = status === 'empty';
  const isCaptain = status === 'captain';
  const isGhost = status === 'ghost';
  const hasPhoto = Boolean(data?.avatarUrl);
  const initial = data?.name?.trim().charAt(0).toUpperCase() ?? data?.email?.trim().charAt(0).toUpperCase() ?? '?';
  const roleLabel = data?.role ? getRoleLabel(data.role) : null;
  const portalLabel = data?.portal_profile && PORTAL_PROFILES[data.portal_profile]
    ? PORTAL_PROFILES[data.portal_profile].label
    : null;

  return (
    <motion.button
      type="button"
      layout
      initial={{ scale: 0.96, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      onClick={onClick}
      className={cn(
        'group relative flex w-full flex-col rounded-[var(--stage-radius-panel)] border transition-all duration-300',
        'bg-[var(--stage-surface-raised)] border-[oklch(1_0_0_/_0.08)]',
        'shadow-[0_4px_24px_-1px_oklch(0_0_0/0.2)]',
        'hover:border-[oklch(1_0_0_/_0.15)] hover:shadow-[0_20px_40px_-4px_oklch(0_0_0/0.25)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[oklch(0.10_0_0)]',
        isEmpty && 'min-h-[120px] items-center justify-center cursor-pointer text-[var(--stage-text-secondary)] hover:bg-[var(--stage-surface-hover)] hover:border-[var(--stage-accent)]/30',
        !isEmpty && 'min-h-[160px] p-4 sm:p-5 items-center justify-center text-center sm:text-left sm:items-start sm:justify-start',
        isCaptain && 'cursor-pointer border-[var(--stage-accent)]/50 bg-[var(--stage-accent)]/10 text-[var(--stage-text-primary)] shadow-[0_0_0_1px_var(--stage-accent)/25] hover:border-[var(--stage-accent)]/60',
        isGhost && 'cursor-pointer bg-[var(--color-surface-100)] text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.10)] hover:border-[oklch(1_0_0_/_0.15)]',
        (status === 'invited' || status === 'active') && 'cursor-pointer text-[var(--stage-text-primary)] hover:bg-[var(--stage-surface-hover)]',
        className
      )}
    >
      {isEmpty ? (
        <>
          <Plus className="mx-auto size-8 lg:size-9 text-current opacity-50 group-hover:opacity-80" strokeWidth={1.5} />
          <span className="mt-1.5 lg:mt-2 block text-xs font-medium tracking-wide text-current/70">Add</span>
        </>
      ) : (
        <div className="flex w-full flex-col items-center gap-3 sm:flex-row sm:items-start sm:gap-4 sm:text-left">
          <div
            className={cn(
              'flex shrink-0 items-center justify-center rounded-full border-2 transition-colors',
              'border-[oklch(1_0_0_/_0.08)]',
              hasPhoto ? 'size-16 sm:size-20' : 'size-12 sm:size-14',
              isCaptain && 'border-[var(--stage-accent)]/50 bg-[var(--stage-accent)]/20 text-[var(--stage-accent)]',
              isGhost && !hasPhoto && 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-secondary)]',
              (status === 'invited' || status === 'active') && !hasPhoto && 'border-[var(--stage-accent)]/40 bg-[var(--stage-accent)]/10 text-[var(--stage-accent)]'
            )}
          >
            {isCaptain ? (
              <Crown className={cn('shrink-0', hasPhoto ? 'size-7 sm:size-8' : 'size-5 lg:size-6')} strokeWidth={1.5} />
            ) : data?.avatarUrl ? (
              <img src={data.avatarUrl} alt="" className="size-full rounded-full object-cover" />
            ) : (
              <span className={cn('font-semibold uppercase tracking-tight', hasPhoto ? 'text-xl sm:text-2xl' : 'text-lg lg:text-xl')}>{initial}</span>
            )}
          </div>
          <div className="min-w-0 flex-1 flex flex-col items-center sm:items-start gap-0.5">
            <p className="w-full truncate font-medium tracking-tight text-[var(--stage-text-primary)] text-sm sm:text-base">
              {data?.name ?? 'Unnamed'}
            </p>
            {(roleLabel || data?.job_title || portalLabel) && (
              <p className="w-full truncate text-[11px] sm:text-xs text-[var(--stage-text-secondary)]">
                {[roleLabel, data?.job_title, portalLabel].filter(Boolean).join(' · ')}
              </p>
            )}
            {data?.email && status !== 'captain' && (
              <p className="w-full truncate text-[10px] text-[var(--stage-text-secondary)]/80 mt-0.5">{data.email}</p>
            )}
          </div>
        </div>
      )}
    </motion.button>
  );
}
