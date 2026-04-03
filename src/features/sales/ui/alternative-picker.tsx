'use client';

import { motion } from 'framer-motion';
import { X, ArrowRightLeft, Loader2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import type { AlternativeWithAvailability } from '../api/catalog-alternatives';

interface AlternativePickerProps {
  alternatives: AlternativeWithAvailability[];
  loading: boolean;
  onSwap: (alternativeId: string) => void;
  onClose: () => void;
}

export function AlternativePicker({ alternatives, loading, onSwap, onClose }: AlternativePickerProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={STAGE_LIGHT}
      className="mt-2 rounded-[var(--stage-radius-panel)] border border-[var(--stage-edge-subtle)] bg-[var(--stage-surface-elevated)] p-3 shadow-[0_4px_16px_-4px_oklch(0_0_0/0.25)]"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium uppercase tracking-widest text-[var(--stage-text-secondary)]">
          Alternatives
        </span>
        <button
          type="button"
          onClick={onClose}
          className="p-1 rounded-[var(--stage-radius-input)] text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.04)] transition-colors focus:outline-none"
          aria-label="Close alternatives"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-3 justify-center text-[var(--stage-text-secondary)]">
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span className="text-xs">Loading alternatives...</span>
        </div>
      ) : alternatives.length === 0 ? (
        <p className="text-xs text-[var(--stage-text-secondary)] py-2 text-center">
          No alternatives configured for this item
        </p>
      ) : (
        <ul className="space-y-1.5">
          {alternatives.map((alt) => (
            <li
              key={alt.id}
              className="flex items-center gap-2 px-2.5 py-2 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] bg-[var(--ctx-card)] hover:bg-[var(--stage-surface-raised)] transition-colors"
            >
              {/* Availability dot */}
              {alt.availability && (
                <span
                  className={cn(
                    'inline-block w-2 h-2 rounded-full shrink-0',
                    alt.availability.status === 'available'
                      ? 'bg-emerald-400'
                      : alt.availability.status === 'tight'
                        ? 'bg-amber-400'
                        : 'bg-red-400'
                  )}
                  title={
                    alt.availability.status === 'available'
                      ? `${alt.availability.available} available`
                      : alt.availability.status === 'tight'
                        ? `${alt.availability.available} of ${alt.availability.stockQuantity} remaining`
                        : `Fully booked`
                  }
                />
              )}

              {/* Name + price */}
              <div className="flex-1 min-w-0">
                <p className="text-sm text-[var(--stage-text-primary)] truncate leading-snug">
                  {alt.name}
                </p>
                <span className="text-xs tabular-nums text-[var(--stage-text-secondary)]">
                  ${alt.price.toLocaleString()}
                  {alt.priceDelta !== 0 && (
                    <span
                      className={cn(
                        'ml-1',
                        alt.priceDelta > 0
                          ? 'text-amber-400'
                          : 'text-emerald-400'
                      )}
                    >
                      ({alt.priceDelta > 0 ? '+' : ''}${alt.priceDelta.toLocaleString()})
                    </span>
                  )}
                </span>
              </div>

              {/* Swap button */}
              <button
                type="button"
                onClick={() => onSwap(alt.id)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[var(--stage-radius-input)] border border-[var(--stage-edge-subtle)] text-xs font-medium text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.06)] transition-colors focus:outline-none focus-visible:ring-1 focus-visible:ring-[var(--stage-accent)] shrink-0"
              >
                <ArrowRightLeft className="w-3 h-3" />
                Swap
              </button>
            </li>
          ))}
        </ul>
      )}
    </motion.div>
  );
}
