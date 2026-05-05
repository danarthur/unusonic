'use client';

/**
 * VenuePicker — venue search/create field for the create-gig modal.
 *
 * Typing surfaces a portaled list of `getVenueSuggestions` results plus a
 * "Create venue" affordance that pre-fills a fresh venue selection (id === '')
 * for the submit handler. Selecting an existing venue replaces the input
 * with the venue name; clearing falls back to free-text.
 *
 * The search effect lives in the parent so this component is purely
 * presentational — it just renders the input + dropdown given query state.
 */

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { MapPin, Plus } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { VenueSuggestion } from '../../actions/lookup';

export interface VenueSelection {
  id: string;
  name: string;
  address?: string | null;
}

export interface VenuePickerProps {
  selectedVenue: VenueSelection | null;
  setSelectedVenue: (v: VenueSelection | null) => void;
  venueQuery: string;
  setVenueQuery: (q: string) => void;
  venueOpen: boolean;
  setVenueOpen: (o: boolean) => void;
  venueResults: VenueSuggestion[];
  setVenueResults: (rs: VenueSuggestion[]) => void;
}

export function VenuePicker({
  selectedVenue,
  setSelectedVenue,
  venueQuery,
  setVenueQuery,
  venueOpen,
  setVenueOpen,
  venueResults,
  setVenueResults,
}: VenuePickerProps) {
  const venueTriggerRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-w-0">
      <label className="block stage-label mb-1.5">Venue</label>
      <input
        ref={venueTriggerRef}
        type="text"
        value={selectedVenue ? selectedVenue.name : venueQuery}
        onChange={(e) => {
          setSelectedVenue(null);
          setVenueQuery(e.target.value);
        }}
        onFocus={() => setVenueOpen(true)}
        onBlur={() => setTimeout(() => setVenueOpen(false), 200)}
        placeholder="Search venue or type to create…"
        className="stage-input w-full min-w-0 truncate"
      />
      {venueOpen && venueQuery.length >= 1 && venueResults.length > 0 && createPortal(
        <div
          className="fixed inset-0 z-[60]"
          onMouseDown={() => setVenueOpen(false)}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: -4 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={STAGE_LIGHT}
            data-surface="raised"
            onMouseDown={(e) => e.stopPropagation()}
            style={(() => {
              const rect = venueTriggerRef.current?.getBoundingClientRect();
              if (!rect) return {};
              const spaceBelow = window.innerHeight - rect.bottom;
              const dropUp = spaceBelow < 220;
              return {
                position: 'fixed' as const,
                left: rect.left,
                width: rect.width,
                ...(dropUp
                  ? { bottom: window.innerHeight - rect.top + 4 }
                  : { top: rect.bottom + 4 }),
              };
            })()}
            className="max-h-[180px] overflow-y-auto overflow-x-hidden rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
          >
            {venueResults.map((r, i) =>
              r.type === 'venue' ? (
                <button
                  key={r.id}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedVenue({
                      id: r.id,
                      name: r.name,
                      address: r.address ?? undefined,
                    });
                    setVenueQuery('');
                    setVenueResults([]);
                    setVenueOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm hover:bg-[oklch(1_0_0/0.08)] min-w-0"
                >
                  <MapPin size={16} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
                  <span className="text-[var(--stage-text-primary)] truncate min-w-0">{r.name}</span>
                  {(r.address || r.city) && (
                    <span className="text-[var(--stage-text-secondary)] text-xs truncate shrink-0 max-w-[140px]">
                      {[r.address, r.city, r.state].filter(Boolean).join(', ')}
                    </span>
                  )}
                </button>
              ) : (
                <button
                  key={`create-${i}`}
                  type="button"
                  onMouseDown={(e) => {
                    e.stopPropagation();
                    setSelectedVenue({ id: '', name: r.query, address: null });
                    setVenueQuery(r.query);
                    setVenueResults([]);
                    setVenueOpen(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)] min-w-0"
                >
                  <Plus size={16} className="shrink-0" strokeWidth={1.5} />
                  <span className="truncate min-w-0">Create venue &quot;{r.query}&quot;</span>
                </button>
              )
            )}
          </motion.div>
        </div>,
        document.body
      )}
    </div>
  );
}
