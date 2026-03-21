'use client';

import * as React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { cn } from '@/shared/lib/utils';

export const GENESIS_TIERS = [
  {
    id: 'scout' as const,
    name: 'Scout',
    price: '$0',
    desc: '1 user, 3 projects',
  },
  {
    id: 'vanguard' as const,
    name: 'Vanguard',
    price: '$29',
    desc: '5 users, unlimited projects',
  },
  {
    id: 'command' as const,
    name: 'Command',
    price: 'Custom',
    desc: 'Unlimited',
  },
] as const;

export type GenesisTierId = (typeof GENESIS_TIERS)[number]['id'];

export interface TierSelectorProps {
  value: GenesisTierId;
  onChange: (value: GenesisTierId) => void;
  className?: string;
  label?: string;
  /** When set, show a "Suggested" badge on this tier (AI recommendation); user can still pick any tier. */
  suggestedTier?: GenesisTierId;
}

export function TierSelector({
  value,
  onChange,
  className,
  label = 'Commission level',
  suggestedTier,
}: TierSelectorProps) {
  return (
    <div className={cn('space-y-3', className)}>
      <label className="text-xs font-medium uppercase tracking-widest text-ink-muted">
        {label}
      </label>
      <div className="grid grid-cols-3 gap-3">
        {GENESIS_TIERS.map((tier) => {
          const isSelected = value === tier.id;
          const isSuggested = suggestedTier === tier.id;
          return (
            <button
              key={tier.id}
              type="button"
              onClick={() => onChange(tier.id)}
              className={cn(
                'relative rounded-2xl p-4 border text-left transition-all duration-200',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-neon-blue/50 focus-visible:ring-offset-2 focus-visible:ring-offset-obsidian',
                isSelected
                  ? 'border-neon-blue/60 bg-neon-blue/10 shadow-[0_0_0_1px_var(--color-neon-blue)/40]'
                  : 'border-mercury bg-obsidian/50 hover:border-mercury/80 hover:bg-obsidian/70'
              )}
              aria-pressed={isSelected}
              aria-label={`${tier.name}: ${tier.desc}, ${tier.price}${isSuggested ? ' (Suggested)' : ''}`}
            >
              {isSuggested && (
                <span className="absolute top-2 right-2 rounded-full bg-neon/15 px-1.5 py-0.5 text-[9px] font-medium uppercase tracking-wider text-neon">
                  Suggested
                </span>
              )}
              {isSelected && !isSuggested && (
                <div className="absolute top-2.5 right-2.5 text-neon-blue" aria-hidden>
                  <CheckCircle2 className="size-4" />
                </div>
              )}
              <div className={cn('text-sm font-medium text-ceramic pr-6', isSuggested && 'pt-4')}>{tier.name}</div>
              <div className="text-xs text-ink-muted mt-0.5">{tier.desc}</div>
              <div className="text-xs font-semibold mt-2 text-neon-blue">{tier.price}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}
