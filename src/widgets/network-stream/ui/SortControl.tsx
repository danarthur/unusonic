'use client';

/**
 * The ordering control for the contacts page.
 *
 * One control for the whole page rather than one per section: the ordering
 * question -- who have I not used in a while -- is asked of the directory, not
 * of a category, and five separate controls would be five decisions to make on
 * a page that should be answering questions rather than posing them.
 *
 * Styled as the existing filter chips rather than a select, so it reads as the
 * same class of control as the role pills already on the page.
 *
 * @module widgets/network-stream/ui/SortControl
 */

import { cn } from '@/shared/lib/utils';
import { SORT_MODES, type SortMode } from '@/entities/network/model/sort-nodes';

export interface SortControlProps {
  value: SortMode;
  onChange: (mode: SortMode) => void;
}

export function SortControl({ value, onChange }: SortControlProps) {
  return (
    <div className="flex items-center gap-1.5" role="group" aria-label="Sort contacts">
      <span className="stage-label text-[var(--stage-text-secondary)]">Sort</span>
      {SORT_MODES.map((mode) => (
        <button
          key={mode.id}
          type="button"
          onClick={() => onChange(mode.id)}
          aria-pressed={value === mode.id}
          className={cn(
            'rounded-full px-2 py-0.5 stage-badge-text transition-colors duration-[80ms]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
            value === mode.id
              ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)] hover:text-[var(--stage-text-primary)]',
          )}
        >
          {mode.label}
        </button>
      ))}
    </div>
  );
}
