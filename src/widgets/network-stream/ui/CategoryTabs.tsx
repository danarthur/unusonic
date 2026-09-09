'use client';

/**
 * Which part of the directory is on screen.
 *
 * Tabs, not chips. These change which region renders, and that is navigation:
 * eBay's rule is "don't use filter chips to navigate users to new experiences or
 * views -- use tabs instead", and Material's is that a page must not mix
 * single-select and multi-select chip sets. This set is single-select and the
 * role chips inside a section are multi-select, so as chips the two were both
 * miscast and in conflict, sitting inches apart in identical pills.
 *
 * Now they are shaped as tabs -- a row with an underline on the active one --
 * and the role chips stay chips. Different altitude, different control, which
 * is the hierarchy Spectrum asks for: "do not compromise having a clear
 * hierarchy by using the same variations or orientations".
 *
 * Counts stay visible. SAP: "we strongly recommend showing a counter on every
 * tab." They also make an empty category visible before it is chosen.
 *
 * Deliberately not persisted. A sort you set once and forget is helpful; a
 * filter you set once and forget silently hides people, and "where did my crew
 * go" is a worse failure than one extra tap.
 *
 * @module widgets/network-stream/ui/CategoryTabs
 */

import { cn } from '@/shared/lib/utils';

export type CategoryFilter = 'all' | 'roster' | 'clients' | 'vendors' | 'venues' | 'unsorted';

export interface CategoryTabsProps {
  value: CategoryFilter;
  onChange: (value: CategoryFilter) => void;
  /** Only categories with something in them, in page order, with their counts. */
  options: { id: CategoryFilter; label: string; count: number }[];
}

export function CategoryTabs({ value, onChange, options }: CategoryTabsProps) {
  // Nothing to narrow when there is only one thing to look at.
  if (options.length <= 1) return null;

  const all: CategoryTabsProps['options'][number] = {
    id: 'all',
    label: 'All',
    count: options.reduce((sum, o) => sum + o.count, 0),
  };

  return (
    <div
      role="tablist"
      aria-label="Contact kind"
      className="flex flex-wrap items-center gap-1 border-b border-[var(--stage-edge-subtle)]"
    >
      {[all, ...options].map((option) => {
        const active = value === option.id;
        return (
          <button
            key={option.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(option.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-2 stage-label transition-colors duration-[80ms]',
              // Two indicators, not one: NN/g asks for more than colour alone to
              // carry which tab is selected.
              '-mb-px border-b-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]',
              active
                ? 'border-[var(--stage-text-primary)] text-[var(--stage-text-primary)]'
                : 'border-transparent text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)]',
            )}
          >
            {option.label}
            <span
              className={cn(
                'tabular-nums',
                active ? 'text-[var(--stage-text-secondary)]' : 'text-[var(--stage-text-tertiary)]',
              )}
            >
              {option.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
