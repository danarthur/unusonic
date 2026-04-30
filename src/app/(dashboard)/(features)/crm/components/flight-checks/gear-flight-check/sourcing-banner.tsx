'use client';

/**
 * SourcingBanner — Layer-2 gap-analysis recommender.
 *
 * Surfaces company-sourced gear items that have at least one matching crew
 * owner so the PM doesn't have to scan every row for the small "crew owns
 * this" hint. Renders as a collapsible info-tinted card; per-item "Source
 * from crew" buttons swap the source on click.
 */

import { AnimatePresence, motion } from 'framer-motion';
import { ChevronRight, Loader2, Sparkles } from 'lucide-react';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { CrewGearMatch, EventGearItem } from '../../../actions/event-gear-items';

type SourcingBannerProps = {
  opportunities: { item: EventGearItem; matches: CrewGearMatch[] }[];
  open: boolean;
  onToggle: () => void;
  sourcingItemId: string | null;
  onSourceFromCrew: (itemId: string, entityId: string) => void;
};

export function SourcingBanner({
  opportunities,
  open,
  onToggle,
  sourcingItemId,
  onSourceFromCrew,
}: SourcingBannerProps) {
  const count = opportunities.length;
  if (count === 0) return null;

  return (
    <div
      className="mb-4 rounded-lg border overflow-hidden"
      style={{
        borderColor: 'color-mix(in oklch, var(--color-unusonic-info) 30%, transparent)',
        background: 'color-mix(in oklch, var(--color-unusonic-info) 8%, transparent)',
      }}
    >
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-3 py-2 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--stage-accent)]"
      >
        <Sparkles
          size={14}
          strokeWidth={1.5}
          className="shrink-0 text-[var(--color-unusonic-info)]"
        />
        <span className="text-sm font-medium text-[var(--stage-text-primary)] flex-1 text-left">
          {count} item{count === 1 ? '' : 's'} could be sourced from crew
        </span>
        <span className="stage-badge-text text-[var(--stage-text-tertiary)] shrink-0">
          {open ? 'Hide' : 'Review'}
        </span>
        <motion.div
          animate={{ rotate: open ? 90 : 0 }}
          transition={STAGE_LIGHT}
          className="shrink-0"
        >
          <ChevronRight size={14} strokeWidth={1.5} className="text-[var(--stage-text-tertiary)]" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={STAGE_LIGHT}
            style={{ overflow: 'hidden' }}
          >
            <ul
              className="divide-y"
              style={{ borderColor: 'color-mix(in oklch, var(--color-unusonic-info) 20%, transparent)' }}
            >
              {opportunities.map(({ item, matches }) => {
                const owner = matches[0];
                const isSourcing = sourcingItemId === item.id;
                return (
                  <li
                    key={item.id}
                    className="flex items-center gap-2 px-3 py-2"
                    style={{
                      borderTopColor:
                        'color-mix(in oklch, var(--color-unusonic-info) 18%, transparent)',
                    }}
                  >
                    <span className="stage-readout truncate flex-1 min-w-0">{item.name}</span>
                    <span className="stage-badge-text text-[var(--stage-text-secondary)] truncate shrink-0 max-w-[40%]">
                      {owner.entityName}
                      {matches.length > 1 ? ` +${matches.length - 1}` : ''} owns
                    </span>
                    <button
                      type="button"
                      disabled={isSourcing}
                      onClick={() => onSourceFromCrew(item.id, owner.entityId)}
                      className="shrink-0 stage-badge-text tracking-tight px-2 py-1 rounded-md border transition-colors disabled:opacity-45"
                      style={{
                        color: 'var(--color-unusonic-info)',
                        background:
                          'color-mix(in oklch, var(--color-unusonic-info) 12%, transparent)',
                        borderColor:
                          'color-mix(in oklch, var(--color-unusonic-info) 30%, transparent)',
                      }}
                    >
                      {isSourcing ? <Loader2 className="size-3 animate-spin" /> : 'Source from crew'}
                    </button>
                  </li>
                );
              })}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
