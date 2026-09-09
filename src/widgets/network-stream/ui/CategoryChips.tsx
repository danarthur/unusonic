'use client';

/**
 * Narrowing the contacts page to one kind of contact.
 *
 * The page is a single scroll of five sections, so "I just want to look at
 * clients" meant scrolling past everything else to reach them. A filter answers
 * that as a sentence -- one tap and the page is only what was asked for --
 * where a view toggle would have added a mode to think about without answering
 * it at all.
 *
 * Deliberately not persisted. A sort you set once and forget is helpful; a
 * filter you set once and forget silently hides people, and "where did my crew
 * go" is a worse failure than one extra tap.
 *
 * @module widgets/network-stream/ui/CategoryChips
 */

import { cn } from '@/shared/lib/utils';

export type CategoryFilter = 'all' | 'roster' | 'clients' | 'vendors' | 'venues' | 'unsorted';

export interface CategoryChipsProps {
  value: CategoryFilter;
  onChange: (value: CategoryFilter) => void;
  /** Only categories with something in them, in page order, with their counts. */
  options: { id: CategoryFilter; label: string; count: number }[];
}

export function CategoryChips({ value, onChange, options }: CategoryChipsProps) {
  // Nothing to narrow when there is only one thing to look at.
  if (options.length <= 1) return null;

  const all: CategoryChipsProps['options'][number] = {
    id: 'all',
    label: 'All',
    count: options.reduce((sum, o) => sum + o.count, 0),
  };

  return (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Filter by kind">
      {[all, ...options].map((option) => (
        <button
          key={option.id}
          type="button"
          onClick={() => onChange(option.id)}
          aria-pressed={value === option.id}
          className={cn(
            'flex items-center gap-1.5 rounded-full px-2.5 py-1 stage-badge-text transition-colors duration-[80ms]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
            value === option.id
              ? 'bg-[oklch(1_0_0_/_0.10)] text-[var(--stage-text-primary)]'
              : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0_/_0.06)] hover:text-[var(--stage-text-primary)]',
          )}
        >
          {option.label}
          <span className="tabular-nums text-[var(--stage-text-tertiary)]">{option.count}</span>
        </button>
      ))}
    </div>
  );
}
