'use client';

/**
 * PlannerPicker — optional planner field for the create-gig modal.
 *
 * Search-or-create input pattern: typing a query (≥2 chars) opens a portaled
 * results listbox; an "Add as planner" footer creates a typed-name ghost
 * (id === '') that the submit handler later splits into first/last and
 * persists as a fresh ghost entity. Selection collapses to a chip-style
 * display with a clear button.
 *
 * Search debounce/effect lives in the parent so this component stays
 * presentational — it just renders the input + dropdown given query state.
 */

import { useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion } from 'framer-motion';
import { Plus, User, X } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { ReferrerSearchResult } from '../../actions/search-referrer';

export interface PlannerSelection {
  id: string;
  name: string;
  subtitle?: string | null;
}

export interface PlannerPickerProps {
  selectedPlanner: PlannerSelection | null;
  setSelectedPlanner: (p: PlannerSelection | null) => void;
  plannerQuery: string;
  setPlannerQuery: (q: string) => void;
  plannerOpen: boolean;
  setPlannerOpen: (o: boolean) => void;
  plannerResults: ReferrerSearchResult[];
  setPlannerResults: (rs: ReferrerSearchResult[]) => void;
  plannerSearching: boolean;
}

export function PlannerPicker({
  selectedPlanner,
  setSelectedPlanner,
  plannerQuery,
  setPlannerQuery,
  plannerOpen,
  setPlannerOpen,
  plannerResults,
  setPlannerResults,
  plannerSearching,
}: PlannerPickerProps) {
  const plannerTriggerRef = useRef<HTMLInputElement>(null);

  return (
    <div className="min-w-0">
      <label htmlFor="create-gig-planner" className="block stage-label mb-1.5">Planner (optional)</label>
      {selectedPlanner ? (
        <div className="flex items-center gap-2 stage-input w-full min-w-0">
          <User size={14} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} />
          <span className="text-sm text-[var(--stage-text-primary)] truncate flex-1">
            {selectedPlanner.name}
            {selectedPlanner.subtitle && (
              <span className="text-xs text-[var(--stage-text-tertiary)] ml-1.5">{selectedPlanner.subtitle}</span>
            )}
          </span>
          <button type="button" onClick={() => { setSelectedPlanner(null); setPlannerQuery(''); }} className="shrink-0 text-[var(--stage-text-tertiary)] hover:text-[var(--stage-text-primary)]">
            <X size={14} strokeWidth={1.5} />
          </button>
        </div>
      ) : (
        <>
          <input
            id="create-gig-planner"
            ref={plannerTriggerRef}
            type="text"
            value={plannerQuery}
            onChange={(e) => setPlannerQuery(e.target.value)}
            onFocus={() => setPlannerOpen(true)}
            onBlur={() => setTimeout(() => setPlannerOpen(false), 200)}
            placeholder="Search planner or type to add…"
            className="stage-input w-full min-w-0 truncate"
          />
          {plannerOpen && plannerQuery.length >= 2 && createPortal(
            <div
              className="fixed inset-0 z-[60]"
              onMouseDown={() => setPlannerOpen(false)}
            >
              <motion.div
                initial={{ opacity: 0, scale: 0.95, y: -4 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                transition={STAGE_LIGHT}
                data-surface="raised"
                onMouseDown={(e) => e.stopPropagation()}
                style={(() => {
                  const rect = plannerTriggerRef.current?.getBoundingClientRect();
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
                className="max-h-[240px] overflow-y-auto overflow-hidden rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)]"
              >
                {plannerResults.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedPlanner({ id: r.id, name: r.name, subtitle: r.subtitle });
                      setPlannerQuery('');
                      setPlannerResults([]);
                      setPlannerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)] transition-colors min-w-0"
                  >
                    <User size={14} className="shrink-0" strokeWidth={1.5} />
                    <span className="truncate min-w-0 flex items-baseline gap-1.5">
                      <span>{r.name}</span>
                      {r.subtitle && <span className="text-xs text-[var(--stage-text-tertiary)]">{r.subtitle}</span>}
                    </span>
                  </button>
                ))}
                {!plannerSearching && (
                  <button
                    type="button"
                    onMouseDown={(e) => {
                      e.stopPropagation();
                      setSelectedPlanner({ id: '', name: plannerQuery.trim(), subtitle: null });
                      setPlannerQuery('');
                      setPlannerResults([]);
                      setPlannerOpen(false);
                    }}
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0/0.08)] min-w-0 border-t border-[oklch(1_0_0_/_0.04)]"
                  >
                    <Plus size={14} className="shrink-0" strokeWidth={1.5} />
                    <span className="truncate min-w-0">Add &quot;{plannerQuery.trim()}&quot; as planner</span>
                  </button>
                )}
              </motion.div>
            </div>,
            document.body
          )}
        </>
      )}
    </div>
  );
}
