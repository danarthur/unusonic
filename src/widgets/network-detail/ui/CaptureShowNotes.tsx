'use client';

/**
 * The collapsed "Show notes" section on an entity's note card.
 *
 * Demotion must not look like deletion. A note that was definitely taken and
 * cannot be found is the failure that ends use of capture altogether -- the
 * mistake Outlook's Clutter made by filing mail into a folder nobody opened,
 * and which its replacement fixed by keeping everything on one screen. So these
 * stay on the profile: collapsed, counted, never filtered off the page.
 *
 * Presentational on purpose. The rows are passed in so this does not need to
 * import the row component from the panel that imports this.
 *
 * @module widgets/network-detail/ui/CaptureShowNotes
 */

import * as React from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface CaptureShowNotesProps {
  count: number;
  /** Open on mount — used when a deep link points at a note filed in here. */
  defaultOpen?: boolean;
  children: React.ReactNode;
}

export function CaptureShowNotes({ count, defaultOpen = false, children }: CaptureShowNotesProps) {
  const [open, setOpen] = React.useState(defaultOpen);

  // A deep link can resolve after the first render, once the captures load.
  React.useEffect(() => {
    if (defaultOpen) setOpen(true);
  }, [defaultOpen]);

  if (count === 0) return null;

  return (
    <div className="border-t border-[var(--stage-edge-subtle)] pt-3">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center gap-1.5 rounded-sm stage-label text-[var(--stage-text-secondary)] transition-colors hover:text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        <ChevronDown
          className={cn('size-3 transition-transform', open && 'rotate-180')}
          strokeWidth={1.5}
        />
        Show notes
        <span className="tabular-nums text-[var(--stage-text-tertiary)]">({count})</span>
      </button>

      {open && <ul className="mt-2 space-y-2">{children}</ul>}
    </div>
  );
}
