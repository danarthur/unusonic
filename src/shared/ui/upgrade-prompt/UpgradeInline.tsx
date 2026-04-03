'use client';

import { AlertTriangle, ArrowUpRight } from 'lucide-react';
import Link from 'next/link';
import { TIER_CONFIG, type TierSlug } from '@/shared/lib/tier-config';

// ─── Types ──────────────────────────────────────────────────────────────────

export interface UpgradeInlineProps {
  type: 'seat_limit' | 'show_limit';
  /** Current usage count */
  current: number;
  /** Plan limit */
  limit: number;
  /** Tier slug the user would need to upgrade to */
  tierNeeded?: TierSlug;
}

// ─── Component ──────────────────────────────────────────────────────────────

export function UpgradeInline({ type, current, limit, tierNeeded }: UpgradeInlineProps) {
  const isHardLimit = current >= limit;
  const tierLabel = tierNeeded ? TIER_CONFIG[tierNeeded].label : 'a higher plan';

  const message =
    type === 'seat_limit'
      ? isHardLimit
        ? `You've reached your team member limit (${current}/${limit}).`
        : `You're approaching your team member limit (${current}/${limit}).`
      : isHardLimit
        ? `You've reached your active show limit (${current}/${limit}).`
        : `You're approaching your active show limit (${current}/${limit}).`;

  return (
    <div
      className="flex items-start gap-2.5 rounded-lg px-3 py-2.5"
      style={{
        background: isHardLimit
          ? 'oklch(0.65 0.18 20 / 0.08)'
          : 'oklch(0.80 0.16 85 / 0.08)',
      }}
    >
      <AlertTriangle
        className="w-4 h-4 mt-0.5 shrink-0"
        style={{
          color: isHardLimit
            ? 'var(--color-unusonic-error)'
            : 'var(--color-unusonic-warning)',
        }}
      />
      <div className="flex-1 min-w-0">
        <p
          className="text-xs font-medium tracking-tight"
          style={{
            color: isHardLimit
              ? 'var(--color-unusonic-error)'
              : 'var(--color-unusonic-warning)',
          }}
        >
          {message}
        </p>
        <Link
          href="/settings/plan"
          className="inline-flex items-center gap-1 text-xs font-medium mt-1 text-[var(--stage-text-primary)] hover:text-[var(--stage-accent)] transition-colors"
        >
          Upgrade to {tierLabel}
          <ArrowUpRight className="w-3 h-3" strokeWidth={1.5} />
        </Link>
      </div>
    </div>
  );
}
