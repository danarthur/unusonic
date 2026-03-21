'use client';

import { motion } from 'framer-motion';
import { Building2, User, Star } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { NetworkNode } from '../model/types';

interface NetworkCardProps {
  node: NetworkNode;
  onClick?: () => void;
  onTogglePreferred?: (relationshipId: string) => void;
  className?: string;
  layoutId?: string;
}

function formatSince(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/** Core (employee): solid ceramic. Partner: frosted glass. Preferred (inner_circle): silk star marker. */
export function NetworkCard({ node, onClick, onTogglePreferred, className, layoutId }: NetworkCardProps) {
  const isCore = node.gravity === 'core';
  const isPartner = node.kind === 'external_partner';
  const isPreferred = node.gravity === 'inner_circle';

  const handleTogglePreferred = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    onTogglePreferred?.(node.id);
  };

  const handleCardKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      onClick?.();
    }
  };

  const content = (
    <>
      {isPartner && onTogglePreferred ? (
        <button
          type="button"
          onClick={handleTogglePreferred}
          className={`absolute top-2.5 left-2.5 z-10 rounded p-1 transition-all duration-150 ${
            isPreferred
              ? 'text-[var(--color-silk)]'
              : 'text-[var(--color-ink-muted)]/30 hover:text-[var(--color-silk)]/70'
          }`}
          title={isPreferred ? 'Remove from preferred' : 'Mark as preferred'}
          aria-label={isPreferred ? 'Remove from preferred' : 'Mark as preferred'}
          aria-pressed={isPreferred}
        >
          <Star
            size={13}
            className={isPreferred ? 'fill-[var(--color-silk)]' : ''}
          />
        </button>
      ) : isPartner && isPreferred ? (
        <span className="absolute top-2.5 left-2.5 text-[var(--color-silk)]" aria-label="Preferred partner">
          <Star size={13} className="fill-[var(--color-silk)]" />
        </span>
      ) : null}
      {isCore && node.meta.doNotRebook && (
        <span
          className="absolute top-3 right-3 size-2 rounded-full bg-[var(--color-signal-warning)]"
          aria-label="Do not rebook"
        />
      )}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          <motion.div
            layoutId={layoutId ? `${layoutId}-avatar` : undefined}
            className={cn(
              'flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-[var(--color-mercury)]/20',
              'size-10'
            )}
          >
            {node.identity.avatarUrl ? (
              <img
                src={node.identity.avatarUrl}
                alt=""
                className="size-full object-cover"
              />
            ) : isPartner && node.identity.entityType !== 'person' && node.identity.entityType !== 'couple' ? (
              <Building2 className="size-5 text-[var(--color-ink-muted)]" />
            ) : (
              <User className="size-5 text-[var(--color-ink-muted)]" />
            )}
          </motion.div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium tracking-tight text-[var(--color-ink)]">
              {node.identity.name}
            </p>
            {isPartner ? (
              node.meta.email ? (
                <p className="truncate text-xs text-[var(--color-ink-muted)]">{node.meta.email}</p>
              ) : null
            ) : (
              <p className="text-xs text-[var(--color-ink-muted)]">{node.identity.label}</p>
            )}
            {node.meta.tags?.length ? (
              <div className="mt-1 flex flex-wrap gap-1">
                {node.meta.tags.slice(0, 3).map((tag) => (
                  <span
                    key={tag}
                    className="rounded bg-[var(--color-ink)]/10 px-1.5 py-0.5 text-[10px] font-medium text-[var(--color-ink-muted)]"
                  >
                    {tag}
                  </span>
                ))}
              </div>
            ) : null}
            {isPartner && (node.meta.outstanding_balance ?? 0) > 0 ? (
              <p className="mt-1.5 text-xs font-medium text-[var(--color-signal-warning)]">
                ${(node.meta.outstanding_balance!).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })} outstanding
              </p>
            ) : node.meta.connectedSince ? (
              <p className="mt-1 text-[10px] text-[var(--color-ink-muted)]/50 tabular-nums">
                since {formatSince(node.meta.connectedSince)}
              </p>
            ) : null}
          </div>
        </div>
        <span
          className={cn(
            'shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium',
            isPartner
              ? 'bg-[var(--color-silk)]/15 text-[var(--color-silk)]'
              : 'bg-[var(--color-ink)]/10 text-[var(--color-ink-muted)]'
          )}
        >
          {isPartner ? (node.identity.label || 'Partner') : 'Team'}
        </span>
      </div>
    </>
  );

  const isArchived = isCore && node.meta.archived;

  return (
    <motion.div
      role="button"
      tabIndex={0}
      layoutId={layoutId}
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
      className={cn(
        'group liquid-levitation relative flex h-full w-full flex-col rounded-3xl p-4 sm:p-5 text-left transition-all duration-300 cursor-pointer',
        'liquid-card text-[var(--color-ink)] hover:border-[var(--color-silk)]/50',
        isArchived && 'opacity-40',
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
