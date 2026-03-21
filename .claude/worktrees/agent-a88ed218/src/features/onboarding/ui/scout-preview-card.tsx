/**
 * ScoutPreviewCard – Network-style card that loads with scout result.
 * Matches NetworkCard design (liquid-card, avatar, name, label, tags).
 * M3 shared axis: skeleton → filled content with staggered reveal.
 * @see https://m3.material.io/styles/motion/transitions/transition-patterns
 * @module features/onboarding/ui/scout-preview-card
 */

'use client';

import { motion } from 'framer-motion';
import { Building2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { ScoutResult } from '@/features/intelligence';
import {
  M3_DURATION_S,
  M3_EASING_ENTER,
} from '@/shared/lib/motion-constants';

interface ScoutPreviewCardProps {
  loading?: boolean;
  data?: ScoutResult | null;
  /** Hero cell — larger avatar and name, more visual weight (matches NetworkCard hero). */
  hero?: boolean;
  className?: string;
}

/** Stagger delays for shared-axis reveal (name → avatar → tags). */
const STAGGER = 0.06;

export function ScoutPreviewCard({
  loading = false,
  data,
  hero = false,
  className,
}: ScoutPreviewCardProps) {
  const name = data?.name?.trim() || null;
  const logoUrl = data?.logoUrl ?? null;
  const label = data?.website ?? data?.doingBusinessAs ?? 'Company';
  const tags = data?.tags?.slice(0, 3) ?? [];
  const avatarSize = hero ? 'size-14' : 'size-10';

  return (
    <motion.div
      layout
      initial={false}
      className={cn(
        'liquid-card liquid-levitation relative flex w-full flex-col rounded-3xl p-4 sm:p-5 text-left transition-all duration-300',
        hero && 'sm:p-6',
        'border border-[var(--glass-border)] hover:border-[var(--color-silk)]/50',
        'bg-[var(--color-glass-surface)]',
        className
      )}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {/* Avatar / logo */}
          <motion.div
            layout
            initial={false}
            transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER }}
            className={cn(
              'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--color-mercury)]/20',
              avatarSize
            )}
          >
            {loading ? (
              <motion.div
                animate={{ opacity: [0.4, 0.8, 0.4] }}
                transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                className="size-full rounded-xl bg-ink/20"
              />
            ) : logoUrl ? (
              <motion.img
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER, delay: STAGGER }}
                src={logoUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : (
              <Building2 className={cn(hero ? 'size-7' : 'size-5', 'text-[var(--color-ink-muted)]')} />
            )}
          </motion.div>
          <div className="min-w-0 flex-1 space-y-1.5">
            {/* Name */}
            {loading ? (
              <motion.div
                animate={{ opacity: [0.3, 0.6, 0.3] }}
                transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
                className={cn('rounded bg-ink/20', hero ? 'h-5 w-40' : 'h-4 w-32')}
              />
            ) : (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER, delay: 0 }}
                className={cn(
                  'truncate font-medium tracking-tight text-[var(--color-ink)]',
                  hero && 'text-base sm:text-lg'
                )}
              >
                {name || '—'}
              </motion.p>
            )}
            {/* Label */}
            {loading ? (
              <motion.div
                animate={{ opacity: [0.2, 0.5, 0.2] }}
                transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
                className="h-3 w-24 rounded bg-ink/15"
              />
            ) : (
              <motion.p
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER, delay: STAGGER }}
                className="text-xs text-[var(--color-ink-muted)] truncate"
              >
                {label}
              </motion.p>
            )}
            {/* Tags */}
            {loading ? (
              <div className="flex gap-1.5 mt-1">
                {[1, 2, 3].map((i) => (
                  <motion.span
                    key={i}
                    animate={{ opacity: [0.2, 0.5, 0.2] }}
                    transition={{
                      duration: 1.1 + i * 0.15,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }}
                    className="h-4 w-12 rounded bg-ink/15"
                  />
                ))}
              </div>
            ) : tags.length > 0 ? (
              <motion.div
                initial={{ opacity: 0, y: 4 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER, delay: STAGGER * 2 }}
                className="mt-1 flex flex-wrap gap-1"
              >
                {tags.map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </motion.div>
            ) : null}
          </div>
        </div>
        <motion.span
          initial={loading ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: M3_DURATION_S, ease: M3_EASING_ENTER, delay: STAGGER * 3 }}
          className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium bg-ink/10 text-[var(--color-ink-muted)]"
        >
          {loading ? '…' : 'Scout'}
        </motion.span>
      </div>
    </motion.div>
  );
}
