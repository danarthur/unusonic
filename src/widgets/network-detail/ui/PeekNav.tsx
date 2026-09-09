'use client';

/**
 * Stepping between adjacent records without closing the panel.
 *
 * The defining feature of a peek, and the one this panel lacked. Airtable's
 * sidesheet, Linear's Quicklook and Jira's preview panel all move between
 * records in place; without it you open the wrong contact and the only way to
 * the next one is to close, find your place in the list again, and open
 * another.
 *
 * The position is here for the same reason it is on a photo viewer: knowing
 * there are forty more behind this one is what makes stepping feel like reading
 * a list rather than guessing.
 *
 * Keyboard as well as buttons, because someone comparing four freelancers will
 * do it faster than they can aim. Typing is left alone -- a search box inside
 * the panel must not navigate away on a stray arrow.
 *
 * @module widgets/network-detail/ui/PeekNav
 */

import * as React from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import type { VisibleEntry } from '@/widgets/network-stream/model/visible-order';

export interface PeekNavProps {
  previous: VisibleEntry | null;
  next: VisibleEntry | null;
  position: { index: number; total: number } | null;
  onGo: (entry: VisibleEntry) => void;
}

/** True when the keystroke belongs to whatever the person is typing in. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || target.isContentEditable;
}

export function PeekNav({ previous, next, position, onGo }: PeekNavProps) {
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTyping(e.target) || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'ArrowUp' && previous) {
        e.preventDefault();
        onGo(previous);
      }
      if (e.key === 'ArrowDown' && next) {
        e.preventDefault();
        onGo(next);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [previous, next, onGo]);

  // Reached by deep link, or filtered out of the list since opening. There is
  // no sequence to step through, so the control says nothing rather than
  // offering a direction that means nothing.
  if (!position) return null;

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <NavButton label="Previous contact" disabled={!previous} onClick={() => previous && onGo(previous)}>
        <ChevronUp className="size-4" strokeWidth={1.5} />
      </NavButton>
      <NavButton label="Next contact" disabled={!next} onClick={() => next && onGo(next)}>
        <ChevronDown className="size-4" strokeWidth={1.5} />
      </NavButton>
      <span className="ml-1 stage-badge-text tabular-nums text-[var(--stage-text-tertiary)]">
        {position.index} of {position.total}
      </span>
    </div>
  );
}

function NavButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'rounded-md p-1 text-[var(--stage-text-secondary)] transition-colors duration-[80ms]',
        'hover:bg-[oklch(1_0_0_/_0.08)] hover:text-[var(--stage-text-primary)]',
        'disabled:pointer-events-none disabled:opacity-30',
        'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
      )}
    >
      {children}
    </button>
  );
}
