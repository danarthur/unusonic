'use client';

/**
 * The one search on the contacts page.
 *
 * There used to be three, one per section, with three labels and three
 * thresholds — and a section's box vanished when it collapsed. Typing a name
 * into the wrong one returned nothing, which does not read as "nothing here",
 * it reads as "not in the system", and nobody reports a person they believe was
 * never there.
 *
 * Not one of the twelve products surveyed ships a per-section input. Scope is a
 * dimension of one search, never a boundary with its own box — Gmail, Slack,
 * Notion, Linear, Attio, both the Contacts apps. NN/g puts the cost plainly:
 * two boxes make people stop and work out which one to type in.
 *
 * Prominence is not decoration here either. Baymard found a muted search field
 * pushes people into browsing instead of searching, and most visits to this
 * page are looking for a name already known.
 *
 * @module widgets/network-stream/ui/ContactSearch
 */

import { Search, X } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export interface ContactSearchProps {
  value: string;
  onChange: (value: string) => void;
  /** The active category, when one is chosen, so the field can name its scope. */
  scopeLabel?: string | null;
}

export function ContactSearch({ value, onChange, scopeLabel }: ContactSearchProps) {
  return (
    <div className="relative w-full">
      <Search
        className="pointer-events-none absolute left-3 top-1/2 size-3.5 -translate-y-1/2 text-[var(--stage-text-secondary)]/60"
        strokeWidth={1.5}
      />
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        // The narrower control names the wider one, so the scope is never a
        // thing to remember.
        placeholder={scopeLabel ? `Search in ${scopeLabel}…` : 'Search contacts…'}
        aria-label={scopeLabel ? `Search in ${scopeLabel}` : 'Search contacts'}
        className={cn(
          'stage-input h-9 w-full !pl-9 pr-9 text-sm',
          'focus-visible:outline-none',
        )}
      />
      {value && (
        <button
          type="button"
          onClick={() => onChange('')}
          aria-label="Clear search"
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-[var(--stage-text-secondary)] transition-colors hover:text-[var(--stage-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
        >
          <X className="size-3.5" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
