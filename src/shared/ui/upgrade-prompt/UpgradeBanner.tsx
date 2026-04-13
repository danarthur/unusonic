'use client';

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertTriangle, ArrowRight, X } from 'lucide-react';
import Link from 'next/link';
import { STAGE_LIGHT } from '@/shared/lib/motion-constants';
import { TIER_CONFIG, type TierSlug } from '@/shared/lib/tier-config';

// ─── Types ──────────────────────────────────────────────────────────────────

export type UpgradeBannerType = 'seat_limit' | 'show_limit' | 'billing_past_due';

export interface UpgradeBannerProps {
  type: UpgradeBannerType;
  /** Current usage count (seats or shows) */
  current?: number;
  /** Plan limit (seats or shows) */
  limit?: number;
  /** Tier slug the user would need to upgrade to */
  tierNeeded?: TierSlug;
  /** If true, the dismiss button is hidden (used for billing/over-limit warnings) */
  persistent?: boolean;
}

// ─── Session dismiss key ────────────────────────────────────────────────────

const DISMISS_KEY_PREFIX = 'unusonic_upgrade_banner_dismissed_';

function getDismissKey(type: UpgradeBannerType): string {
  return `${DISMISS_KEY_PREFIX}${type}`;
}

function isDismissed(type: UpgradeBannerType): boolean {
  if (typeof window === 'undefined') return false;
  return sessionStorage.getItem(getDismissKey(type)) === '1';
}

// ─── Copy ───────────────────────────────────────────────────────────────────

function getBannerCopy(props: UpgradeBannerProps): { title: string; subtitle: string } {
  const tierLabel = props.tierNeeded ? TIER_CONFIG[props.tierNeeded].label : 'a higher plan';

  switch (props.type) {
    case 'seat_limit':
      return {
        title: `Your plan includes ${props.limit ?? 0} team members (${props.current ?? 0} in use)`,
        subtitle: `Upgrade to ${tierLabel} for more seats, or remove members to free up space.`,
      };
    case 'show_limit':
      return {
        title: `Your plan includes ${props.limit ?? 0} active shows (${props.current ?? 0} in use)`,
        subtitle: `Upgrade to ${tierLabel} for ${props.tierNeeded === 'studio' ? 'unlimited' : 'more'} shows.`,
      };
    case 'billing_past_due':
      return {
        title: 'Your payment method needs attention',
        subtitle: 'Update your billing details to keep your workspace running smoothly.',
      };
  }
}

// ─── Component ──────────────────────────────────────────────────────────────

export function UpgradeBanner(props: UpgradeBannerProps) {
  const { type, persistent = false } = props;
  const [visible, setVisible] = useState(() => !isDismissed(type));

  const dismiss = () => {
    if (persistent) return;
    sessionStorage.setItem(getDismissKey(type), '1');
    setVisible(false);
  };

  const { title, subtitle } = getBannerCopy(props);
  const isWarning = type === 'billing_past_due';

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={STAGE_LIGHT}
          className="w-full"
        >
          <div className="stage-panel rounded-2xl px-5 py-4 flex items-center gap-4">
            <div
              className="flex items-center justify-center w-8 h-8 rounded-xl shrink-0"
              style={{
                background: isWarning
                  ? 'oklch(0.65 0.18 20 / 0.12)'
                  : 'oklch(0.80 0.16 85 / 0.12)',
              }}
            >
              <AlertTriangle
                className="w-4 h-4"
                style={{
                  color: isWarning
                    ? 'var(--color-unusonic-error)'
                    : 'var(--color-unusonic-warning)',
                }}
              />
            </div>

            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium tracking-tight text-[var(--stage-text-primary)]">
                {title}
              </p>
              <p className="text-xs text-[var(--stage-text-secondary)] mt-0.5">
                {subtitle}
              </p>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <Link
                href={type === 'billing_past_due' ? '/settings/billing' : '/settings/plan'}
                className="flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-medium bg-[var(--stage-accent)] text-[var(--stage-text-on-accent)] hover:bg-[oklch(0.90_0_0)] transition-colors"
              >
                {type === 'billing_past_due' ? 'Update billing' : 'Review plan'}
                <ArrowRight className="w-3 h-3" strokeWidth={1.5} />
              </Link>
              {!persistent && (
                <button
                  type="button"
                  onClick={dismiss}
                  aria-label="Dismiss"
                  className="p-1.5 rounded-lg text-[var(--stage-text-secondary)] hover:text-[var(--stage-text-primary)] hover:bg-[oklch(1_0_0_/_0.10)] transition-[background-color,color]"
                >
                  <X className="w-3.5 h-3.5" strokeWidth={1.5} />
                </button>
              )}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
