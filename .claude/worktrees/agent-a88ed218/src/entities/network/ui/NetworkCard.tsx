'use client';

import { motion } from 'framer-motion';
import { Building2, User, PinOff } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { NetworkNode } from '../model/types';

interface NetworkCardProps {
  node: NetworkNode;
  onClick?: () => void;
  onUnpin?: (relationshipId: string) => void;
  className?: string;
  layoutId?: string;
  /** Hero cell in Bento grid — larger layout, more emphasis */
  hero?: boolean;
}

/** Core (employee): solid ceramic. Inner Circle (partner): frosted glass + glowing border. */
export function NetworkCard({ node, onClick, onUnpin, className, layoutId, hero = false }: NetworkCardProps) {
  const isCore = node.gravity === 'core';
  const isPartner = node.kind === 'external_partner';

  const handleUnpin = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onUnpin?.(node.id);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  const avatarSize = hero ? 'size-14' : 'size-10';

  const content = (
    <>
      {isPartner && onUnpin && (
        <button
          type="button"
          onClick={handleUnpin}
          className="absolute top-2 right-2 z-10 rounded-full p-1.5 text-white/20 opacity-0 transition-opacity hover:bg-[var(--color-signal-error)]/10 hover:text-[var(--color-signal-error)] group-hover:opacity-100"
          title="Remove from partners"
          aria-label="Remove from partners"
        >
          <PinOff size={14} />
        </button>
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <motion.div
            layoutId={layoutId ? `${layoutId}-avatar` : undefined}
            className={cn(
              'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--color-mercury)]/20',
              avatarSize
            )}
          >
            {node.identity.avatarUrl ? (
              <img
                src={node.identity.avatarUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : isPartner ? (
              <Building2 className="size-5 text-[var(--color-ink-muted)]" />
            ) : (
              <User className="size-5 text-[var(--color-ink-muted)]" />
            )}
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className={cn('truncate font-medium tracking-tight text-[var(--color-ink)]', hero && 'text-base sm:text-lg')}>
              {node.identity.name}
            </p>
            <p className="text-xs text-[var(--color-ink-muted)]">{node.identity.label}</p>
            {node.meta.tags?.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {node.meta.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-ink/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
            isPartner
              ? 'bg-[var(--color-silk)]/15 text-[var(--color-silk)]'
              : 'bg-ink/10 text-[var(--color-ink-muted)]'
          )}
        >
          {isPartner ? 'Partner' : 'Employee'}
        </span>
      </div>
    </>
  );

  return (
    <motion.div
      role="button"
      tabIndex={0}
      layoutId={layoutId}
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
      className={cn(
        'group liquid-levitation relative flex w-full flex-col rounded-3xl p-4 sm:p-5 text-left transition-all duration-300 cursor-pointer',
        isCore
          ? 'border-none bg-[var(--color-surface-100)] text-[var(--color-ink)] shadow-[0_4px_24px_-1px_oklch(0_0_0/0.25),inset_0_1px_0_0_oklch(1_0_0/0.06)]'
          : 'liquid-card text-[var(--color-ink)] hover:border-[var(--color-silk)]/50',
        hero && 'sm:p-6',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-silk)]/40 focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-obsidian)]',
        className
      )}
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
    >
      {content}
    </motion.div>
  );
}
