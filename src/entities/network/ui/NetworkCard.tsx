'use client';

/**
 * A contact card.
 *
 * Every card is the same shape: avatar, name, role, then three detail lines
 * drawn from an ordered priority list in card-slots.ts. That uniformity is the
 * point. The card previously had nine conditionally-rendered slots, so a
 * partner with a balance, three tags, two capabilities, an employer and two
 * affiliates stood roughly three times the height of a bare person card, and
 * the grid looked broken even when every card was individually fine.
 *
 * Uniform silhouette matters because the mode this grid has to serve is
 * shortlist building -- "who can work Saturday" -- which is comparison, and
 * comparison needs the same field in the same physical position on every card.
 * Recognition is search's job and search does it better.
 *
 * What is on each line, and why each cut field was cut, lives in card-slots.ts.
 */

import * as React from 'react';

import { motion } from 'framer-motion';
import { User, Star, MapPin } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_MEDIUM } from '@/shared/lib/motion-constants';
import { resolveCardSlots, isFlagged, CARD_SLOT_COUNT, type CardSlot } from '../model/card-slots';
import type { NetworkNode } from '../model/types';

interface NetworkCardProps {
  node: NetworkNode;
  onClick?: () => void;
  /** Open one of the people named on a company card. */
  onAffiliateClick?: (entityId: string) => void;
  onTogglePreferred?: (relationshipId: string) => void;
  className?: string;
  layoutId?: string;
}

/** First letter of the name — a deliberate mark where there is no photo. */
function monogram(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

/**
 * Nearly every entity here is a ghost with no photo, so the fallback has to look
 * intentional rather than broken.
 *
 * Faces are load-bearing for people: this is a business where you book someone
 * you stood next to at load-in, and the face is the recognition token. For a
 * company the same is not true -- a Building2 icon repeated forty times down a
 * column is visual static -- so companies and venues get a monogram instead.
 */
function Avatar({ node }: { node: NetworkNode }) {
  const type = node.identity.entityType;
  const isPersonal = type === 'person' || type === 'couple';

  return (
    <div
      className={cn(
        'flex size-10 shrink-0 items-center justify-center overflow-hidden bg-[var(--stage-surface-nested)] mt-0.5',
        isPersonal ? 'rounded-full' : 'rounded-[var(--stage-radius-nested)]',
      )}
    >
      {node.identity.avatarUrl ? (
        <img src={node.identity.avatarUrl} alt="" className="size-full object-cover" />
      ) : isPersonal ? (
        <User className="size-5 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
      ) : (
        <span className="stage-label text-[var(--stage-text-secondary)]">
          {monogram(node.identity.name)}
        </span>
      )}
    </div>
  );
}

/** One detail line. Empty renders as reserved space so rows stay aligned. */
function SlotRow({
  slot,
  onAffiliateClick,
}: {
  slot: CardSlot | undefined;
  onAffiliateClick?: (entityId: string) => void;
}) {
  if (!slot) return <p className="stage-label truncate" aria-hidden>&nbsp;</p>;

  const className = cn(
    'truncate',
    slot.numeric
      ? 'font-[family-name:var(--stage-data-font)] text-[length:var(--stage-readout-sm-size)] tabular-nums'
      : 'stage-label',
    slot.tone === 'warning'
      ? 'text-[var(--color-unusonic-warning)]'
      : 'text-[var(--stage-text-secondary)]',
  );

  if (!slot.links) return <p className={className}>{slot.text}</p>;

  return (
    <p className={className}>
      {slot.links.map((link, i) => (
        <React.Fragment key={link.entityId}>
          {i > 0 && ', '}
          <button
            type="button"
            // The card itself is role="button"; without stopPropagation this
            // would open the company instead of the person.
            onClick={(e) => {
              e.stopPropagation();
              onAffiliateClick?.(link.entityId);
            }}
            className="underline decoration-[var(--stage-text-tertiary)] underline-offset-2 hover:text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] rounded-sm"
          >
            {link.name}
          </button>
        </React.Fragment>
      ))}
      {slot.suffix}
    </p>
  );
}

export function NetworkCard({
  node,
  onClick,
  onAffiliateClick,
  onTogglePreferred,
  className,
  layoutId,
}: NetworkCardProps) {
  const slots = React.useMemo(() => resolveCardSlots(node), [node]);
  const isStarred = node.starred === true;
  // Two different things that used to be one flag:
  //   starred   -- this user's personal pin. Silent, and nobody else sees it.
  //   preferred -- the workspace's shared tier judgement on the relationship.
  const isPreferred = node.gravity === 'inner_circle';
  const flagged = isFlagged(node);

  const handleToggleStar = (e: React.MouseEvent) => {
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

  return (
    <motion.div
      role="button"
      tabIndex={0}
      layoutId={layoutId}
      onClick={onClick}
      onKeyDown={handleCardKeyDown}
      data-surface="elevated"
      className={cn(
        'group stage-panel-interactive relative flex h-full w-full flex-col rounded-[var(--stage-radius-panel)] p-4 sm:p-5 text-left cursor-pointer',
        'text-[var(--stage-text-primary)]',
        node.meta.archived && 'opacity-40',
        // Preferred used to cost a corner and 60px of width to print a word.
        // Brightness is the accent here, so a slightly lifted edge carries it
        // instead, and the name it goes by is left to assistive tech.
        isPreferred && 'ring-1 ring-inset ring-[oklch(1_0_0_/_0.10)]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--stage-void)]',
        className,
      )}
      transition={STAGE_MEDIUM}
    >
      {/* This user's own pin. Personal and silent — colleagues do not see it. */}
      {onTogglePreferred && (
        <button
          type="button"
          onClick={handleToggleStar}
          className={cn(
            'absolute top-2.5 right-2.5 z-10 rounded p-1 transition-colors duration-[80ms]',
            isStarred
              ? 'text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-tertiary)] opacity-0 group-hover:opacity-100 focus:opacity-100 hover:text-[var(--stage-text-primary)]/70',
          )}
          title={isStarred ? 'Remove star' : 'Star for quick access'}
          aria-label={isStarred ? 'Remove star' : 'Star for quick access'}
          aria-pressed={isStarred}
        >
          <Star size={14} strokeWidth={1.5} className={isStarred ? 'fill-[var(--stage-text-primary)]' : ''} />
        </button>
      )}

      <div className="flex min-w-0 items-start gap-3">
        <Avatar node={node} />

        <div className="min-w-0 flex-1">
          <p className="truncate font-medium tracking-tight text-[length:var(--stage-data-size)] text-[var(--stage-text-primary)]">
            {node.identity.name}
            {isPreferred && <span className="sr-only"> — Preferred</span>}
          </p>

          {/* Role, once. It used to render in the subtitle AND in a right-hand
              chip, which read as the card repeating itself. */}
          <p className="flex items-center gap-1.5 truncate stage-label text-[var(--stage-text-secondary)]">
            {node.identity.entityType === 'venue' && (
              <MapPin className="size-3 shrink-0" strokeWidth={1.5} aria-hidden />
            )}
            {node.identity.label}
          </p>

          {/* Fixed rows so a sparse entity does not collapse the layout and
              knock every card below it out of alignment. */}
          <div className="mt-2 flex flex-col gap-0.5">
            {Array.from({ length: CARD_SLOT_COUNT }, (_, i) => (
              <SlotRow key={slots[i]?.key ?? `empty-${i}`} slot={slots[i]} onAffiliateClick={onAffiliateClick} />
            ))}
          </div>
        </div>
      </div>

      {/* Do not rebook. Shown for every relationship, not only employees: on a
          vendor or a venue this is the more consequential judgement, and the
          one most likely to be missed by whoever books them next. */}
      {flagged && (
        <p className="mt-3 flex items-center gap-1.5 stage-badge-text text-[var(--color-unusonic-warning)]">
          <span className="size-1.5 shrink-0 rounded-full bg-[var(--color-unusonic-warning)]" aria-hidden />
          Do not rebook
        </p>
      )}
    </motion.div>
  );
}
