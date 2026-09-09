'use client';

/**
 * The visual anchor for an entity, rendered the same way on every surface.
 *
 * Identity is the one thing that is supposed to repeat across the card, the
 * panel and the full page -- recognising is easier than recalling, and seeing
 * the same mark is how you know you have not lost the thread when a click moves
 * you between surfaces. Content is what must not repeat.
 *
 * Nearly every entity here is a ghost with no photo, so the fallback has to look
 * intentional rather than broken. Faces are load-bearing for people: this is a
 * business where you book someone you stood next to at load-in, and the face is
 * the recognition token. For a company the same is not true -- one building icon
 * repeated forty times down a column is visual static -- so companies and venues
 * get a monogram.
 *
 * @module entities/network/ui/EntityAvatar
 */

import { User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface EntityAvatarProps {
  name: string;
  avatarUrl?: string | null;
  entityType?: 'person' | 'company' | 'venue' | 'couple';
  /** Tailwind size class. Defaults to the contact-card size. */
  sizeClassName?: string;
  className?: string;
}

/** First letter of the name — a deliberate mark where there is no photo. */
function monogram(name: string): string {
  return name.trim().charAt(0).toUpperCase() || '?';
}

export function EntityAvatar({
  name,
  avatarUrl,
  entityType,
  sizeClassName = 'size-10',
  className,
}: EntityAvatarProps) {
  const isPersonal = entityType === 'person' || entityType === 'couple';

  return (
    <div
      className={cn(
        // An edge, not a heavier fill. On a row the avatar sits on the page
        // ground rather than inside a panel, where a nested surface is close
        // enough to the background that a monogram disappears into it -- and
        // the house rule for nesting past the surface ceiling is border, not
        // more fill.
        'flex shrink-0 items-center justify-center overflow-hidden',
        'border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)]',
        sizeClassName,
        isPersonal ? 'rounded-full' : 'rounded-[var(--stage-radius-nested)]',
        className,
      )}
    >
      <AvatarMark name={name} avatarUrl={avatarUrl} isPersonal={isPersonal} />
    </div>
  );
}

function AvatarMark({
  name,
  avatarUrl,
  isPersonal,
}: {
  name: string;
  avatarUrl?: string | null;
  isPersonal: boolean;
}) {
  if (avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element -- avatars are small, already-sized remote URLs; next/image adds a loader round trip for no gain here.
    return <img src={avatarUrl} alt="" className="size-full object-cover" />;
  }
  if (isPersonal) {
    return <User className="size-1/2 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />;
  }
  return <span className="stage-label text-[var(--stage-text-secondary)]">{monogram(name)}</span>;
}
