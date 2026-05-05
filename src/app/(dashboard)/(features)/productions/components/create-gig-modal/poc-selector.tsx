'use client';

/**
 * PocSelector — Q2 of the create-gig modal.
 *
 * Renders the "Who is our day-of point of contact?" question for individual
 * and couple host kinds. Trigger button + portaled listbox grouped by role
 * (Host / Planner / Venue / Other). When the user picks "Someone else", an
 * IndividualHostForm slides in below for the separate POC's contact details.
 *
 * The PocOption list and the currently-selected option are derived in the
 * parent so this component stays a presentational dropdown — it doesn't need
 * to know about partnerA/B, planner, or venue selections directly.
 */

import { useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { ChevronDown, User } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { IndividualHostForm, type PersonHostFormState } from './host-cast-forms';

export type PocChoice =
  | { kind: 'host'; hostIndex: 1 | 2 }
  | { kind: 'planner' }
  | { kind: 'venue' }
  | { kind: 'separate' }
  | null;

export type PocOption = {
  key: string;
  label: string;
  role: 'Host' | 'Planner' | 'Venue' | 'Other';
  choice: PocChoice;
};

export interface PocSelectorProps {
  pocChoice: PocChoice;
  setPocChoice: (c: PocChoice) => void;
  pocOptions: PocOption[];
  selectedPocOption: PocOption | undefined;
  pocSeparateForm: PersonHostFormState;
  setPocSeparateForm: React.Dispatch<React.SetStateAction<PersonHostFormState>>;
}

export function PocSelector({
  pocChoice,
  setPocChoice,
  pocOptions,
  selectedPocOption,
  pocSeparateForm,
  setPocSeparateForm,
}: PocSelectorProps) {
  const pocTriggerRef = useRef<HTMLButtonElement>(null);
  const [pocOpen, setPocOpen] = useState(false);

  return (
    <>
      <label htmlFor="poc-trigger" className="block stage-label mb-1.5">Who is our day-of point of contact?</label>
      <div className="relative">
        <button
          id="poc-trigger"
          ref={pocTriggerRef}
          type="button"
          onClick={() => setPocOpen((o) => !o)}
          onBlur={() => setTimeout(() => setPocOpen(false), 180)}
          aria-expanded={pocOpen}
          aria-haspopup="listbox"
          className={cn(
            'flex w-full min-w-0 items-center gap-2 rounded-[var(--stage-radius-input,6px)] border px-3 h-[var(--stage-input-height,34px)] text-[length:var(--stage-input-font-size,13px)] text-left transition-colors duration-75',
            pocOpen
              ? 'border-[var(--stage-accent)] bg-[var(--ctx-well)] ring-1 ring-[var(--stage-accent)]'
              : 'border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-well)] hover:border-[oklch(1_0_0_/_0.20)]',
            'focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]'
          )}
        >
          <User size={14} className="shrink-0 text-[var(--stage-text-secondary)]" strokeWidth={1.5} aria-hidden />
          <span className={cn('flex-1 min-w-0 truncate tracking-tight', selectedPocOption ? 'text-[var(--stage-text-primary)]' : 'text-[var(--stage-text-tertiary)]')}>
            {selectedPocOption ? selectedPocOption.label : 'Choose point of contact'}
          </span>
          {selectedPocOption && (
            <span className="shrink-0 text-[length:var(--stage-label-size,11px)] text-[var(--stage-text-tertiary)] uppercase tracking-wide">
              {selectedPocOption.role}
            </span>
          )}
          <ChevronDown size={14} className={cn('shrink-0 text-[var(--stage-text-tertiary)] transition-transform duration-[80ms]', pocOpen && 'rotate-180')} aria-hidden />
        </button>
        {pocOpen && createPortal(
          <div
            className="fixed inset-0 z-[60]"
            onMouseDown={() => setPocOpen(false)}
          >
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={STAGE_LIGHT}
              role="listbox"
              aria-label="Day-of point of contact"
              data-surface="raised"
              onMouseDown={(e) => e.stopPropagation()}
              style={(() => {
                const rect = pocTriggerRef.current?.getBoundingClientRect();
                if (!rect) return {};
                const spaceBelow = window.innerHeight - rect.bottom;
                const dropUp = spaceBelow < 260;
                return {
                  position: 'fixed' as const,
                  left: rect.left,
                  width: rect.width,
                  ...(dropUp
                    ? { bottom: window.innerHeight - rect.top + 4 }
                    : { top: rect.bottom + 4 }),
                };
              })()}
              className="max-h-[280px] overflow-y-auto rounded-[var(--stage-radius-input,6px)] border border-[oklch(1_0_0_/_0.10)] bg-[var(--ctx-dropdown)] shadow-[0_8px_32px_oklch(0_0_0/0.5)] py-1"
            >
              {(['Host', 'Planner', 'Venue', 'Other'] as const).map((group) => {
                const groupOpts = pocOptions.filter((o) => o.role === group);
                if (groupOpts.length === 0) return null;
                return (
                  <div key={group}>
                    <div className="px-3 pt-2 pb-1 stage-label text-[var(--stage-text-tertiary)]">{group}</div>
                    {groupOpts.map((opt) => {
                      const active = selectedPocOption?.key === opt.key;
                      return (
                        <button
                          key={opt.key}
                          type="button"
                          role="option"
                          aria-selected={active}
                          onMouseDown={(e) => {
                            e.stopPropagation();
                            setPocChoice(opt.choice);
                            setPocOpen(false);
                          }}
                          className={cn(
                            'flex w-full items-center px-3 py-2 text-left text-[length:var(--stage-input-font-size,13px)] tracking-tight transition-colors min-w-0',
                            active
                              ? 'bg-[oklch(1_0_0/0.08)] text-[var(--stage-text-primary)] font-medium'
                              : 'text-[var(--stage-text-secondary)] hover:bg-[oklch(1_0_0/0.08)] hover:text-[var(--stage-text-primary)]'
                          )}
                        >
                          <span className="flex-1 min-w-0 truncate">{opt.label}</span>
                        </button>
                      );
                    })}
                  </div>
                );
              })}
            </motion.div>
          </div>,
          document.body
        )}
      </div>
      <AnimatePresence>
        {pocChoice?.kind === 'separate' && (
          <motion.div
            key="poc-separate"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={STAGE_LIGHT}
            className="overflow-hidden"
          >
            <div className="pt-3">
              <IndividualHostForm form={pocSeparateForm} setForm={setPocSeparateForm} />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}

